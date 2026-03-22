import type { QueryClient, Query } from "@tanstack/react-query";
import { queryKeys } from "../../store/queryKeys";

type QueryKey = readonly unknown[];

function isThreadQuery(query: Query<unknown, unknown, unknown, QueryKey>) {
  return query.queryKey[0] === "thread";
}

export function invalidateAllThreadQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => isThreadQuery(query as Query<unknown, unknown, unknown, QueryKey>),
  });
}

export function removeAllThreadQueries(queryClient: QueryClient) {
  return queryClient.removeQueries({
    predicate: (query) => isThreadQuery(query as Query<unknown, unknown, unknown, QueryKey>),
  });
}

export async function refreshOnAppActive(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
    queryClient.invalidateQueries({ queryKey: queryKeys.historySync }),
    queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
    invalidateAllThreadQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: queryKeys.mailbox }),
    queryClient.invalidateQueries({ queryKey: queryKeys.recentCalls }),
    queryClient.invalidateQueries({ queryKey: queryKeys.callSession }),
  ]);
}

export async function refreshAfterHistorySync(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
    invalidateAllThreadQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: queryKeys.mailbox }),
    queryClient.invalidateQueries({ queryKey: queryKeys.recentCalls }),
    queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
  ]);
}

export async function refreshOnSocketEvent(
  queryClient: QueryClient,
  event: "connect" | "reconnect" | "threads.updated" | "thread.items.created" | "mailbox.updated" | "call.state" | "badge.updated",
  payload?: { threadId?: string | null }
) {
  if (event === "connect" || event === "reconnect") {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
      queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
      invalidateAllThreadQueries(queryClient),
      queryClient.invalidateQueries({ queryKey: queryKeys.mailbox }),
      queryClient.invalidateQueries({ queryKey: queryKeys.recentCalls }),
      queryClient.invalidateQueries({ queryKey: queryKeys.callSession }),
    ]);
    return;
  }

  if (event === "threads.updated") {
    await queryClient.invalidateQueries({ queryKey: queryKeys.threads });
    return;
  }

  if (event === "thread.items.created") {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
      payload?.threadId ? queryClient.invalidateQueries({ queryKey: queryKeys.thread(payload.threadId) }) : Promise.resolve(),
    ]);
    return;
  }

  if (event === "mailbox.updated") {
    await queryClient.invalidateQueries({ queryKey: queryKeys.mailbox });
    return;
  }

  if (event === "call.state") {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.callSession }),
      queryClient.invalidateQueries({ queryKey: queryKeys.recentCalls }),
    ]);
  }
}
