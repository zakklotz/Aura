import { PayloadRefType, ThreadItemType, UnreadState, VoiceRegistrationState } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { decodeCursor, encodeCursor } from "../../lib/cursor.js";
import { AppError } from "../../lib/errors.js";
import { emitToBusiness } from "../../lib/socket.js";

function voicemailPreview(transcriptText: string | null): string {
  return transcriptText?.trim() ? transcriptText.trim().slice(0, 80) : "New voicemail";
}

export async function findContactForNumber(businessId: string, e164: string) {
  const contactNumber = await prisma.contactPhoneNumber.findUnique({
    where: {
      businessId_e164: {
        businessId,
        e164,
      },
    },
    include: {
      contact: true,
    },
  });

  return contactNumber?.contact ?? null;
}

export async function ensureThread(input: {
  businessId: string;
  phoneNumberId: string;
  externalParticipantE164: string;
}) {
  const existing = await prisma.thread.findUnique({
    where: {
      businessId_phoneNumberId_externalParticipantE164: {
        businessId: input.businessId,
        phoneNumberId: input.phoneNumberId,
        externalParticipantE164: input.externalParticipantE164,
      },
    },
  });

  const contact = await findContactForNumber(input.businessId, input.externalParticipantE164);

  if (existing) {
    if (existing.contactId !== contact?.id) {
      return prisma.thread.update({
        where: { id: existing.id },
        data: {
          contactId: contact?.id ?? null,
        },
      });
    }
    return existing;
  }

  return prisma.thread.create({
    data: {
      businessId: input.businessId,
      phoneNumberId: input.phoneNumberId,
      externalParticipantE164: input.externalParticipantE164,
      contactId: contact?.id ?? null,
      participants: {
        create: [
          {
            kind: "BUSINESS_NUMBER",
            phoneNumberId: input.phoneNumberId,
          },
          {
            kind: "EXTERNAL",
            externalParticipantE164: input.externalParticipantE164,
            contactId: contact?.id ?? null,
          },
        ],
      },
    },
  });
}

export async function recomputeThread(threadId: string): Promise<void> {
  const items = await prisma.threadItem.findMany({
    where: { threadId },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 200,
  });

  const lastItem = items[0] ?? null;
  const unreadSmsCount = items.filter((item) => item.itemType === ThreadItemType.SMS_INBOUND && item.unreadState === UnreadState.UNREAD).length;
  const unreadMissedCallCount = items.filter((item) => item.itemType === ThreadItemType.MISSED_CALL && item.unreadState === UnreadState.UNREAD).length;
  const unheardVoicemailCount = items.filter((item) => item.itemType === ThreadItemType.VOICEMAIL && item.unreadState === UnreadState.UNREAD).length;

  await prisma.thread.update({
    where: { id: threadId },
    data: {
      lastOccurredAt: lastItem?.occurredAt ?? new Date(),
      lastThreadItemId: lastItem?.id ?? null,
      lastPreview: lastItem?.previewText ?? null,
      unreadSmsCount,
      unreadMissedCallCount,
      unheardVoicemailCount,
      totalUnreadCount: unreadSmsCount + unreadMissedCallCount + unheardVoicemailCount,
    },
  });
}

export async function syncNotificationStateForBusiness(businessId: string): Promise<void> {
  const aggregate = await prisma.thread.aggregate({
    where: { businessId },
    _sum: {
      unreadSmsCount: true,
      unreadMissedCallCount: true,
      unheardVoicemailCount: true,
      totalUnreadCount: true,
    },
  });

  const memberships = await prisma.businessMembership.findMany({
    where: { businessId },
    include: {
      user: true,
    },
  });

  for (const membership of memberships) {
    const registration = await prisma.deviceRegistration.findFirst({
      where: {
        userId: membership.userId,
        businessId,
      },
      orderBy: { updatedAt: "desc" },
    });

    await prisma.notificationState.upsert({
      where: {
        businessId_userId: {
          businessId,
          userId: membership.userId,
        },
      },
      create: {
        businessId,
        userId: membership.userId,
        unreadSmsCount: aggregate._sum.unreadSmsCount ?? 0,
        unreadMissedCallCount: aggregate._sum.unreadMissedCallCount ?? 0,
        unheardVoicemailCount: aggregate._sum.unheardVoicemailCount ?? 0,
        totalUnreadCount: aggregate._sum.totalUnreadCount ?? 0,
        voiceRegistrationState: registration?.voiceRegistrationState ?? VoiceRegistrationState.REGISTERING,
      },
      update: {
        unreadSmsCount: aggregate._sum.unreadSmsCount ?? 0,
        unreadMissedCallCount: aggregate._sum.unreadMissedCallCount ?? 0,
        unheardVoicemailCount: aggregate._sum.unheardVoicemailCount ?? 0,
        totalUnreadCount: aggregate._sum.totalUnreadCount ?? 0,
        voiceRegistrationState: registration?.voiceRegistrationState ?? VoiceRegistrationState.REGISTERING,
      },
    });
  }
}

export async function projectThreadItem(input: {
  businessId: string;
  phoneNumberId: string;
  externalParticipantE164: string;
  itemType: ThreadItemType;
  unreadState: UnreadState;
  payloadRefType: PayloadRefType;
  payloadRefId: string;
  dedupeKey: string;
  occurredAt: Date;
  previewText: string | null;
}) {
  const thread = await ensureThread({
    businessId: input.businessId,
    phoneNumberId: input.phoneNumberId,
    externalParticipantE164: input.externalParticipantE164,
  });
  const contact = await findContactForNumber(input.businessId, input.externalParticipantE164);

  const item = await prisma.threadItem.upsert({
    where: {
      businessId_dedupeKey: {
        businessId: input.businessId,
        dedupeKey: input.dedupeKey,
      },
    },
    create: {
      threadId: thread.id,
      businessId: input.businessId,
      phoneNumberId: input.phoneNumberId,
      contactId: contact?.id ?? null,
      itemType: input.itemType,
      unreadState: input.unreadState,
      payloadRefType: input.payloadRefType,
      payloadRefId: input.payloadRefId,
      dedupeKey: input.dedupeKey,
      occurredAt: input.occurredAt,
      previewText: input.previewText,
    },
    update: {
      contactId: contact?.id ?? null,
      unreadState: input.unreadState,
      occurredAt: input.occurredAt,
      previewText: input.previewText,
      payloadRefType: input.payloadRefType,
      payloadRefId: input.payloadRefId,
    },
  });

  await recomputeThread(thread.id);
  await syncNotificationStateForBusiness(input.businessId);
  emitToBusiness(input.businessId, "thread.items.created", {
    threadId: thread.id,
    payloadRefId: input.payloadRefId,
    itemType: input.itemType,
  });
  emitToBusiness(input.businessId, "threads.updated", { businessId: input.businessId });
  if (input.itemType === ThreadItemType.VOICEMAIL) {
    emitToBusiness(input.businessId, "mailbox.updated", { businessId: input.businessId });
  }
  emitToBusiness(input.businessId, "badge.updated", { businessId: input.businessId });
  return item;
}

function buildCursorWhere(fieldName: "occurredAt" | "lastOccurredAt", cursor: { occurredAt: string; id: string } | null) {
  if (!cursor) return undefined;
  return {
    OR: [
      {
        [fieldName]: {
          lt: new Date(cursor.occurredAt),
        },
      },
      {
        [fieldName]: new Date(cursor.occurredAt),
        id: {
          lt: cursor.id,
        },
      },
    ],
  };
}

export async function listThreads(input: { businessId: string; limit?: number; cursor?: string }) {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const cursor = decodeCursor(input.cursor);

  const threads = await prisma.thread.findMany({
    where: {
      businessId: input.businessId,
      ...(buildCursorWhere("lastOccurredAt", cursor) ?? {}),
    },
    include: {
      contact: true,
      phoneNumber: true,
    },
    orderBy: [{ lastOccurredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const page = threads.slice(0, limit);
  const next = threads[limit];

  return {
    items: page.map((thread) => ({
      id: thread.id,
      businessId: thread.businessId,
      phoneNumberId: thread.phoneNumberId,
      externalParticipantE164: thread.externalParticipantE164,
      title: thread.contact?.displayName ?? thread.externalParticipantE164,
      subtitle: thread.lastPreview,
      lastOccurredAt: thread.lastOccurredAt,
      unreadSmsCount: thread.unreadSmsCount,
      unreadMissedCallCount: thread.unreadMissedCallCount,
      unheardVoicemailCount: thread.unheardVoicemailCount,
      totalUnreadCount: thread.totalUnreadCount,
    })),
    nextCursor: next
      ? encodeCursor({
          occurredAt: next.lastOccurredAt.toISOString(),
          id: next.id,
        })
      : null,
  };
}

export async function getThreadById(businessId: string, threadId: string) {
  const thread = await prisma.thread.findFirst({
    where: {
      id: threadId,
      businessId,
    },
    include: {
      contact: true,
      phoneNumber: true,
    },
  });

  if (!thread) {
    throw new AppError(404, "not_found", "Thread not found");
  }

  return thread;
}

export async function listThreadItems(input: { businessId: string; threadId: string; limit?: number; cursor?: string }) {
  await getThreadById(input.businessId, input.threadId);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const cursor = decodeCursor(input.cursor);

  const items = await prisma.threadItem.findMany({
    where: {
      threadId: input.threadId,
      ...(buildCursorWhere("occurredAt", cursor) ?? {}),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const page = items.slice(0, limit);
  const next = items[limit];
  const voicemailIds = page.filter((item) => item.payloadRefType === "VOICEMAIL").map((item) => item.payloadRefId);
  const messageIds = page.filter((item) => item.payloadRefType === "MESSAGE").map((item) => item.payloadRefId);
  const callEventIds = page.filter((item) => item.payloadRefType === "CALL_EVENT").map((item) => item.payloadRefId);

  const [voicemails, messages, callEvents] = await Promise.all([
    prisma.voicemail.findMany({ where: { id: { in: voicemailIds } } }),
    prisma.message.findMany({ where: { id: { in: messageIds } } }),
    prisma.callEvent.findMany({ where: { id: { in: callEventIds } } }),
  ]);

  const voicemailMap = new Map(voicemails.map((row) => [row.id, row]));
  const messageMap = new Map(messages.map((row) => [row.id, row]));
  const callEventMap = new Map(callEvents.map((row) => [row.id, row]));

  return {
    items: page.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      occurredAt: item.occurredAt,
      unreadState: item.unreadState,
      previewText: item.previewText,
      payload:
        item.payloadRefType === "VOICEMAIL"
          ? voicemailMap.get(item.payloadRefId) ?? null
          : item.payloadRefType === "MESSAGE"
            ? messageMap.get(item.payloadRefId) ?? null
            : item.payloadRefType === "CALL_EVENT"
              ? callEventMap.get(item.payloadRefId) ?? null
              : null,
    })),
    nextCursor: next
      ? encodeCursor({
          occurredAt: next.occurredAt.toISOString(),
          id: next.id,
        })
      : null,
  };
}

export async function markThreadRead(input: { businessId: string; threadId: string }) {
  const thread = await getThreadById(input.businessId, input.threadId);
  await prisma.threadItem.updateMany({
    where: {
      threadId: thread.id,
      itemType: {
        in: [ThreadItemType.SMS_INBOUND, ThreadItemType.MISSED_CALL],
      },
      unreadState: UnreadState.UNREAD,
    },
    data: {
      unreadState: UnreadState.READ,
    },
  });

  await recomputeThread(thread.id);
  await syncNotificationStateForBusiness(thread.businessId);
  emitToBusiness(thread.businessId, "threads.updated", { businessId: thread.businessId });
  emitToBusiness(thread.businessId, "badge.updated", { businessId: thread.businessId });

  return {
    ok: true,
  };
}

export async function listMailbox(input: { businessId: string; limit?: number; cursor?: string }) {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const cursor = decodeCursor(input.cursor);

  const items = await prisma.threadItem.findMany({
    where: {
      businessId: input.businessId,
      itemType: ThreadItemType.VOICEMAIL,
      ...(buildCursorWhere("occurredAt", cursor) ?? {}),
    },
    include: {
      thread: {
        include: {
          contact: true,
        },
      },
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const page = items.slice(0, limit);
  const next = items[limit];
  const voicemailIds = page.map((item) => item.payloadRefId);
  const voicemails = await prisma.voicemail.findMany({
    where: { id: { in: voicemailIds } },
  });
  const voicemailMap = new Map(voicemails.map((row) => [row.id, row]));

  return {
    items: page.map((item) => {
      const voicemail = voicemailMap.get(item.payloadRefId);
      return {
        id: item.id,
        threadId: item.threadId,
        voicemailId: voicemail?.id ?? null,
        title: item.thread.contact?.displayName ?? item.thread.externalParticipantE164,
        occurredAt: item.occurredAt,
        unheard: item.unreadState === UnreadState.UNREAD,
        durationSeconds: voicemail?.durationSeconds ?? null,
        transcriptStatus: voicemail?.transcriptStatus ?? null,
        transcriptSnippet:
          voicemail?.transcriptStatus === "COMPLETED"
            ? voicemailPreview(voicemail.transcriptText)
            : voicemail?.transcriptStatus === "PENDING"
              ? "transcribing..."
              : null,
      };
    }),
    nextCursor: next
      ? encodeCursor({
          occurredAt: next.occurredAt.toISOString(),
          id: next.id,
        })
      : null,
  };
}

export async function markVoicemailHeard(voicemailId: string, businessId: string) {
  const voicemail = await prisma.voicemail.findFirst({
    where: { id: voicemailId, businessId },
  });

  if (!voicemail) {
    throw new AppError(404, "not_found", "Voicemail not found");
  }

  await prisma.threadItem.updateMany({
    where: {
      businessId,
      itemType: ThreadItemType.VOICEMAIL,
      payloadRefType: "VOICEMAIL",
      payloadRefId: voicemail.id,
    },
    data: {
      unreadState: UnreadState.HEARD,
    },
  });

  await recomputeThread(voicemail.threadId);
  await syncNotificationStateForBusiness(businessId);
  emitToBusiness(businessId, "mailbox.updated", { businessId });
  emitToBusiness(businessId, "threads.updated", { businessId });
  emitToBusiness(businessId, "badge.updated", { businessId });

  return {
    ok: true,
  };
}
