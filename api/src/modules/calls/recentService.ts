import { CallEventType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

function occurredAtForCallEvent(input: {
  endedAt: Date | null;
  answeredAt: Date | null;
  startedAt: Date | null;
  createdAt: Date;
}): Date {
  return input.endedAt ?? input.answeredAt ?? input.startedAt ?? input.createdAt;
}

export async function listRecentCalls(input: { businessId: string; limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const callEvents = await prisma.callEvent.findMany({
    where: {
      businessId: input.businessId,
      eventType: {
        in: [CallEventType.MISSED_CALL, CallEventType.CALL_COMPLETED, CallEventType.CALL_DECLINED],
      },
    },
    include: {
      thread: {
        include: {
          contact: true,
        },
      },
    },
    take: 300,
  });

  const items = callEvents
    .map((callEvent) => {
      const occurredAt = occurredAtForCallEvent(callEvent);
      return {
        id: callEvent.id,
        callSid: callEvent.callSid,
        threadId: callEvent.threadId,
        eventType: callEvent.eventType,
        direction: callEvent.direction,
        title: callEvent.thread.contact?.displayName ?? callEvent.externalParticipantE164,
        externalParticipantE164: callEvent.externalParticipantE164,
        occurredAt: occurredAt.toISOString(),
        durationSeconds: callEvent.durationSeconds,
        providerStatus: callEvent.providerStatus,
        errorCode: callEvent.errorCode,
      };
    })
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, limit);

  return {
    items,
  };
}
