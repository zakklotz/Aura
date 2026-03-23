import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  fetchBootstrap,
  fetchMailbox,
  fetchRecentCalls,
  fetchThreads,
  type ThreadPayload,
  type ThreadsPayload,
} from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import {
  type CachedViewer,
  loadCommunicationCache,
  saveThreadToCache,
  saveThreadsToCache,
} from "../services/cache/communicationCache";
import { invalidateAllThreadQueries, removeAllThreadQueries } from "../services/query/communicationRefresh";

function isThreadQueryKey(queryKey: readonly unknown[]): queryKey is ReturnType<typeof queryKeys.thread> {
  return queryKey[0] === "thread" && typeof queryKey[1] === "string";
}

export function CommunicationCacheBootstrap({
  queryClient,
  isSignedIn,
  userId,
}: {
  queryClient: QueryClient;
  isSignedIn: boolean;
  userId: string | null | undefined;
}) {
  const bootstrap = useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: fetchBootstrap,
    enabled: isSignedIn,
  });
  const hydratedUserIdRef = useRef<string | null>(null);
  const cachedViewerRef = useRef<CachedViewer | null>(null);
  const currentViewerRef = useRef<CachedViewer | null>(null);
  const persistedDataRef = useRef(new Map<string, number>());
  const prefetchedViewerKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      hydratedUserIdRef.current = null;
      cachedViewerRef.current = null;
      currentViewerRef.current = null;
      persistedDataRef.current.clear();
      prefetchedViewerKeyRef.current = null;
      queryClient.removeQueries({ queryKey: queryKeys.threads });
      void removeAllThreadQueries(queryClient);
      return;
    }

    if (hydratedUserIdRef.current === userId) {
      return;
    }

    hydratedUserIdRef.current = userId;

    void loadCommunicationCache(userId).then((snapshot) => {
      if (!snapshot || hydratedUserIdRef.current !== userId) {
        return;
      }

      cachedViewerRef.current = snapshot.viewer;
      currentViewerRef.current = snapshot.viewer;

      if (snapshot.threads && !queryClient.getQueryData(queryKeys.threads)) {
        queryClient.setQueryData(queryKeys.threads, snapshot.threads);
      }

      for (const threadId of snapshot.recentThreadIds) {
        if (!queryClient.getQueryData(queryKeys.thread(threadId)) && snapshot.threadById[threadId]) {
          queryClient.setQueryData(queryKeys.thread(threadId), snapshot.threadById[threadId]);
        }
      }
    });
  }, [isSignedIn, queryClient, userId]);

  useEffect(() => {
    const businessId = bootstrap.data?.business?.id ?? null;
    const viewerKey = userId && businessId ? `${userId}:${businessId}` : null;

    if (!isSignedIn || !viewerKey) {
      return;
    }

    if (prefetchedViewerKeyRef.current === viewerKey) {
      return;
    }

    prefetchedViewerKeyRef.current = viewerKey;

    void Promise.allSettled([
      queryClient.prefetchQuery({
        queryKey: queryKeys.threads,
        queryFn: fetchThreads,
        staleTime: 0,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.mailbox,
        queryFn: fetchMailbox,
        staleTime: 0,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.recentCalls,
        queryFn: fetchRecentCalls,
        staleTime: 0,
      }),
    ]);
  }, [bootstrap.data?.business?.id, isSignedIn, queryClient, userId]);

  useEffect(() => {
    if (!bootstrap.data?.user.id) {
      return;
    }

    const nextViewer = {
      userId: bootstrap.data.user.id,
      businessId: bootstrap.data.business?.id ?? null,
    };

    currentViewerRef.current = nextViewer;

    if (
      cachedViewerRef.current &&
      cachedViewerRef.current.userId === nextViewer.userId &&
      cachedViewerRef.current.businessId !== nextViewer.businessId
    ) {
      queryClient.removeQueries({ queryKey: queryKeys.threads });
      void removeAllThreadQueries(queryClient);
    }
  }, [bootstrap.data?.business?.id, bootstrap.data?.user.id, queryClient]);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      return;
    }

    return queryClient.getQueryCache().subscribe((event) => {
      const query = event?.query;
      if (!query || query.state.status !== "success" || query.state.dataUpdatedAt === 0) {
        return;
      }

      const cacheKey = JSON.stringify(query.queryKey);
      if (persistedDataRef.current.get(cacheKey) === query.state.dataUpdatedAt) {
        return;
      }

      persistedDataRef.current.set(cacheKey, query.state.dataUpdatedAt);

      const viewer = currentViewerRef.current;
      if (!viewer || viewer.userId !== userId || !viewer.businessId) {
        return;
      }

      if (query.queryKey[0] === queryKeys.threads[0]) {
        void saveThreadsToCache(viewer, query.state.data as ThreadsPayload);
        return;
      }

      if (isThreadQueryKey(query.queryKey)) {
        void saveThreadToCache(viewer, query.queryKey[1], query.state.data as ThreadPayload);
      }
    });
  }, [isSignedIn, queryClient, userId]);

  useEffect(() => {
    if (!isSignedIn || !bootstrap.data?.business?.id) {
      return;
    }

    void invalidateAllThreadQueries(queryClient);
  }, [bootstrap.data?.business?.id, isSignedIn, queryClient]);

  return null;
}
