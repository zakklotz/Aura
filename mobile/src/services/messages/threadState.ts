import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../store/queryKeys";
import type { MessagePayload, ThreadPayload, ThreadsPayload } from "../api/softphoneApi";

export type ConversationItem = ThreadPayload["items"][number] & {
  localOnly?: boolean;
  localTempId?: string;
};

type ConversationData = Omit<ThreadPayload, "items"> & {
  items: ConversationItem[];
};

type ThreadSummaryItem = ThreadsPayload["items"][number] & {
  localOnly?: boolean;
};

type ThreadListData = Omit<ThreadsPayload, "items"> & {
  items: ThreadSummaryItem[];
};

function isMessagePayload(payload: ConversationItem["payload"]): payload is MessagePayload {
  return Boolean(payload && typeof payload === "object" && "body" in payload && "deliveryStatus" in payload);
}

function recomputeThreadUnreadCount(items: ConversationItem[]) {
  return items.filter(
    (item) =>
      (item.itemType === "SMS_INBOUND" || item.itemType === "MISSED_CALL") &&
      item.unreadState === "UNREAD"
  ).length;
}

function sortThreadItems(items: ConversationItem[]) {
  return [...items].sort((a, b) => {
    if (a.occurredAt === b.occurredAt) {
      return b.id.localeCompare(a.id);
    }
    return b.occurredAt.localeCompare(a.occurredAt);
  });
}

function sortThreadSummaries(items: ThreadSummaryItem[]) {
  return [...items].sort((a, b) => {
    if (a.lastOccurredAt === b.lastOccurredAt) {
      return b.id.localeCompare(a.id);
    }
    return b.lastOccurredAt.localeCompare(a.lastOccurredAt);
  });
}

export function getMessagePayload(item: ConversationItem) {
  return isMessagePayload(item.payload) ? item.payload : null;
}

export function getMessageBody(item: ConversationItem) {
  const payload = getMessagePayload(item);
  return payload?.body ?? item.previewText ?? "";
}

export function getMessageStateLabel(item: ConversationItem) {
  const payload = getMessagePayload(item);
  if (!payload || payload.direction !== "OUTBOUND") {
    return null;
  }

  switch (payload.deliveryStatus) {
    case "PENDING":
      return "Sending";
    case "DELIVERED":
      return "Delivered";
    case "FAILED":
      return "Failed";
    default:
      return "Sent";
  }
}

export function canRetryMessage(item: ConversationItem) {
  return getMessageStateLabel(item) === "Failed";
}

export function buildOptimisticConversationItem(input: {
  threadId: string;
  externalParticipantE164: string;
  body: string;
  occurredAt: string;
  clientTempId: string;
}) {
  const payload: MessagePayload = {
    id: `local-message-${input.clientTempId}`,
    businessId: "local",
    phoneNumberId: "local",
    threadId: input.threadId,
    externalParticipantE164: input.externalParticipantE164,
    direction: "OUTBOUND",
    messageSid: null,
    body: input.body,
    mediaUrls: [],
    deliveryStatus: "PENDING",
    errorCode: null,
    providerStatus: null,
    clientTempId: input.clientTempId,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };

  return {
    id: `local-thread-item-${input.clientTempId}`,
    itemType: "SMS_OUTBOUND" as const,
    occurredAt: input.occurredAt,
    unreadState: "READ" as const,
    previewText: input.body,
    payload,
    localOnly: true,
    localTempId: input.clientTempId,
  };
}

export function getDisplayConversationItems(items: ConversationItem[]) {
  const canonicalTempIds = new Set(
    items
      .filter((item) => !item.localOnly)
      .map((item) => getMessagePayload(item)?.clientTempId)
      .filter((value): value is string => Boolean(value))
  );

  return items.filter((item) => !(item.localOnly && item.localTempId && canonicalTempIds.has(item.localTempId)));
}

export function markThreadReadOptimistically(queryClient: QueryClient, threadId: string) {
  queryClient.setQueryData<ConversationData | undefined>(queryKeys.thread(threadId), (current) => {
    if (!current) {
      return current;
    }

    const nextItems = current.items.map((item) =>
      (item.itemType === "SMS_INBOUND" || item.itemType === "MISSED_CALL") && item.unreadState === "UNREAD"
        ? {
            ...item,
            unreadState: "READ" as const,
          }
        : item
    );

    return {
      ...current,
      thread: {
        ...current.thread,
        totalUnreadCount: recomputeThreadUnreadCount(nextItems),
      },
      items: nextItems,
    };
  });

  queryClient.setQueryData<ThreadListData | undefined>(queryKeys.threads, (current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      items: current.items.map((item) =>
        item.id === threadId
          ? {
              ...item,
              unreadSmsCount: 0,
              unreadMissedCallCount: 0,
              totalUnreadCount: item.unheardVoicemailCount,
            }
          : item
      ),
    };
  });
}

export function insertOptimisticMessage(queryClient: QueryClient, input: {
  threadId: string;
  threadTitle: string;
  externalParticipantE164: string;
  body: string;
  occurredAt: string;
  clientTempId: string;
}) {
  const optimisticItem = buildOptimisticConversationItem(input);

  queryClient.setQueryData<ConversationData | undefined>(queryKeys.thread(input.threadId), (current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      thread: {
        ...current.thread,
        lastOccurredAt: input.occurredAt,
      },
      items: sortThreadItems([optimisticItem, ...current.items]),
    };
  });

  queryClient.setQueryData<ThreadListData | undefined>(queryKeys.threads, (current) => {
    if (!current) {
      return current;
    }

    const existing = current.items.find((item) => item.id === input.threadId);
    const nextItem: ThreadSummaryItem = {
      id: input.threadId,
      title: existing?.title ?? input.threadTitle,
      subtitle: input.body,
      lastOccurredAt: input.occurredAt,
      unreadSmsCount: existing?.unreadSmsCount ?? 0,
      unreadMissedCallCount: existing?.unreadMissedCallCount ?? 0,
      unheardVoicemailCount: existing?.unheardVoicemailCount ?? 0,
      totalUnreadCount: existing?.totalUnreadCount ?? 0,
      localOnly: true,
    };

    return {
      ...current,
      items: sortThreadSummaries([
        nextItem,
        ...current.items.filter((item) => item.id !== input.threadId),
      ]),
    };
  });
}

export function applySendResult(queryClient: QueryClient, threadId: string, clientTempId: string, message: MessagePayload) {
  queryClient.setQueryData<ConversationData | undefined>(queryKeys.thread(threadId), (current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      thread: {
        ...current.thread,
        lastOccurredAt: message.createdAt,
      },
      items: current.items.map((item) =>
        item.localTempId === clientTempId
          ? {
              ...item,
              occurredAt: message.createdAt,
              previewText: message.body,
              payload: message,
            }
          : item
      ),
    };
  });

  queryClient.setQueryData<ThreadListData | undefined>(queryKeys.threads, (current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      items: current.items.map((item) =>
        item.id === threadId
          ? {
              ...item,
              subtitle: message.body,
              lastOccurredAt: message.createdAt,
              localOnly: true,
            }
          : item
      ),
    };
  });
}

export function markSendFailed(queryClient: QueryClient, threadId: string, clientTempId: string, errorMessage: string) {
  queryClient.setQueryData<ConversationData | undefined>(queryKeys.thread(threadId), (current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      items: current.items.map((item) => {
        if (item.localTempId !== clientTempId) {
          return item;
        }

        const payload = getMessagePayload(item);
        if (!payload) {
          return item;
        }

        return {
          ...item,
          payload: {
            ...payload,
            deliveryStatus: "FAILED",
            providerStatus: errorMessage,
            updatedAt: new Date().toISOString(),
          },
        };
      }),
    };
  });
}
