export const queryKeys = {
  bootstrap: ["bootstrap"] as const,
  historySync: ["history-sync"] as const,
  threads: ["threads"] as const,
  thread: (threadId: string) => ["thread", threadId] as const,
  mailbox: ["mailbox"] as const,
  recentCalls: ["recent-calls"] as const,
  contacts: ["contacts"] as const,
  settings: ["settings"] as const,
  callSession: ["call-session"] as const,
};
