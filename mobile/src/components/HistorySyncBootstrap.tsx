import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { fetchBootstrap, fetchHistorySyncStatus, startHistorySync } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";

export function HistorySyncBootstrap({
  queryClient,
  isSignedIn,
}: {
  queryClient: QueryClient;
  isSignedIn: boolean;
}) {
  const hasStartedRef = useRef(false);
  const bootstrap = useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: fetchBootstrap,
    enabled: isSignedIn,
  });
  const historySync = useQuery({
    queryKey: queryKeys.historySync,
    queryFn: fetchHistorySyncStatus,
    enabled: isSignedIn,
    refetchInterval: (query) => (query.state.data?.state === "syncing" ? 3_000 : false),
  });

  useEffect(() => {
    if (!isSignedIn || bootstrap.isLoading || historySync.isLoading) {
      return;
    }

    if (!bootstrap.data?.business || !bootstrap.data?.primaryPhoneNumber) {
      return;
    }

    if (!historySync.data?.isSyncAvailable || historySync.data.state !== "idle" || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    void startHistorySync()
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.historySync });
      })
      .catch(() => {
        hasStartedRef.current = false;
      });
  }, [
    bootstrap.data?.business?.id,
    bootstrap.data?.primaryPhoneNumber?.id,
    bootstrap.isLoading,
    historySync.data,
    historySync.isLoading,
    isSignedIn,
    queryClient,
  ]);

  useEffect(() => {
    if (historySync.data?.state !== "completed") {
      return;
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.threads });
    queryClient.invalidateQueries({ queryKey: queryKeys.mailbox });
    queryClient.invalidateQueries({ queryKey: queryKeys.recentCalls });
    queryClient.invalidateQueries({ queryKey: queryKeys.settings });
  }, [historySync.data?.completedAt, historySync.data?.state, queryClient]);

  return null;
}
