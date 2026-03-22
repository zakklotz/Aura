import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ThreadPayload, ThreadsPayload } from "../api/softphoneApi";

const STORAGE_KEY = "aura:communication-cache:v1";
const MAX_RECENT_THREADS = 10;

export type CachedViewer = {
  userId: string;
  businessId: string | null;
};

type CommunicationCacheSnapshot = {
  version: 1;
  viewer: CachedViewer;
  threads: ThreadsPayload | null;
  recentThreadIds: string[];
  threadById: Record<string, ThreadPayload>;
};

function sanitizeThreads(input: ThreadsPayload): ThreadsPayload | null {
  if (input.items.some((item) => (item as { localOnly?: boolean }).localOnly)) {
    return null;
  }

  return {
    ...input,
    items: input.items.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      lastOccurredAt: item.lastOccurredAt,
      unreadSmsCount: item.unreadSmsCount,
      unreadMissedCallCount: item.unreadMissedCallCount,
      unheardVoicemailCount: item.unheardVoicemailCount,
      totalUnreadCount: item.totalUnreadCount,
    })),
  };
}

function sanitizeThread(input: ThreadPayload): ThreadPayload {
  return {
    ...input,
    items: input.items
      .filter((item) => !(item as { localOnly?: boolean }).localOnly)
      .map((item) => ({
        id: item.id,
        itemType: item.itemType,
        occurredAt: item.occurredAt,
        unreadState: item.unreadState,
        previewText: item.previewText,
        payload: item.payload,
      })),
  };
}

async function readSnapshot() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CommunicationCacheSnapshot;
    if (parsed.version !== 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeSnapshot(snapshot: CommunicationCacheSnapshot) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export async function loadCommunicationCache(userId: string) {
  const snapshot = await readSnapshot();
  if (!snapshot || snapshot.viewer.userId !== userId) {
    return null;
  }
  return snapshot;
}

export async function saveThreadsToCache(viewer: CachedViewer, threads: ThreadsPayload) {
  const sanitized = sanitizeThreads(threads);
  if (!sanitized) {
    return;
  }

  const existing = await readSnapshot();
  await writeSnapshot({
    version: 1,
    viewer,
    threads: sanitized,
    recentThreadIds: existing?.viewer.userId === viewer.userId ? existing.recentThreadIds : [],
    threadById: existing?.viewer.userId === viewer.userId ? existing.threadById : {},
  });
}

export async function saveThreadToCache(viewer: CachedViewer, threadId: string, thread: ThreadPayload) {
  const existing = await readSnapshot();
  const recentThreadIds = [
    threadId,
    ...(existing?.viewer.userId === viewer.userId ? existing.recentThreadIds.filter((id) => id !== threadId) : []),
  ].slice(0, MAX_RECENT_THREADS);

  const baseThreadById = existing?.viewer.userId === viewer.userId ? existing.threadById : {};
  const nextThreadById: Record<string, ThreadPayload> = {};

  for (const id of recentThreadIds) {
    if (id === threadId) {
      nextThreadById[id] = sanitizeThread(thread);
      continue;
    }

    if (baseThreadById[id]) {
      nextThreadById[id] = baseThreadById[id];
    }
  }

  await writeSnapshot({
    version: 1,
    viewer,
    threads: existing?.viewer.userId === viewer.userId ? existing.threads : null,
    recentThreadIds,
    threadById: nextThreadById,
  });
}
