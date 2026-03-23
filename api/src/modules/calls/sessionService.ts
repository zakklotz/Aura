import {
  CallDirection,
  CallSessionSource,
  CallSessionState,
  NormalizedErrorCode,
  Prisma,
  type CallSession,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { PersistedCallSessionState } from "./types.js";

const CALL_SESSION_RETENTION_MS = 30 * 60 * 1000;
const PENDING_SESSION_WINDOW_MS = 5 * 60 * 1000;

export const callSessionStatePrecedence: Record<CallSessionState, number> = {
  INCOMING: 10,
  ANSWERING: 20,
  OUTGOING_DIALING: 20,
  CONNECTING: 30,
  ACTIVE: 40,
  ENDED: 50,
  FAILED: 50,
};

const liveSessionStates = [
  CallSessionState.INCOMING,
  CallSessionState.ANSWERING,
  CallSessionState.OUTGOING_DIALING,
  CallSessionState.CONNECTING,
  CallSessionState.ACTIVE,
];

const pendingSessionStates = [
  CallSessionState.INCOMING,
  CallSessionState.ANSWERING,
  CallSessionState.OUTGOING_DIALING,
  CallSessionState.CONNECTING,
];

type UpsertCallSessionTransitionInput = {
  businessId: string;
  state: PersistedCallSessionState;
  source: "api" | "sdk" | "webhook";
  occurredAt: Date;
  callSid?: string | null;
  parentCallSid?: string | null;
  childCallSid?: string | null;
  direction?: "inbound" | "outbound" | null;
  phoneNumberId?: string | null;
  externalParticipantE164?: string | null;
  lastActorUserId?: string | null;
  lastActorDeviceId?: string | null;
  errorCode?: NormalizedErrorCode | null;
  errorMessage?: string | null;
};

function toDbState(state: PersistedCallSessionState): CallSessionState {
  switch (state) {
    case "incoming":
      return CallSessionState.INCOMING;
    case "answering":
      return CallSessionState.ANSWERING;
    case "outgoing_dialing":
      return CallSessionState.OUTGOING_DIALING;
    case "connecting":
      return CallSessionState.CONNECTING;
    case "active":
      return CallSessionState.ACTIVE;
    case "ended":
      return CallSessionState.ENDED;
    case "failed":
      return CallSessionState.FAILED;
  }
}

export function fromDbState(state: CallSessionState): PersistedCallSessionState {
  switch (state) {
    case CallSessionState.INCOMING:
      return "incoming";
    case CallSessionState.ANSWERING:
      return "answering";
    case CallSessionState.OUTGOING_DIALING:
      return "outgoing_dialing";
    case CallSessionState.CONNECTING:
      return "connecting";
    case CallSessionState.ACTIVE:
      return "active";
    case CallSessionState.ENDED:
      return "ended";
    case CallSessionState.FAILED:
      return "failed";
  }
}

function toDbSource(source: UpsertCallSessionTransitionInput["source"]): CallSessionSource {
  switch (source) {
    case "api":
      return CallSessionSource.API;
    case "sdk":
      return CallSessionSource.SDK;
    case "webhook":
      return CallSessionSource.WEBHOOK;
  }
}

function toDbDirection(direction: UpsertCallSessionTransitionInput["direction"]): CallDirection | null {
  if (direction === "inbound") return CallDirection.INBOUND;
  if (direction === "outbound") return CallDirection.OUTBOUND;
  return null;
}

function shouldRetain(state: CallSessionState): boolean {
  return state === CallSessionState.ENDED || state === CallSessionState.FAILED;
}

function retentionDate(occurredAt: Date, state: CallSessionState): Date | null {
  if (!shouldRetain(state)) return null;
  return new Date(occurredAt.getTime() + CALL_SESSION_RETENTION_MS);
}

function mergeMetadata(existing: CallSession | null, input: UpsertCallSessionTransitionInput) {
  return {
    phoneNumberId: input.phoneNumberId ?? existing?.phoneNumberId ?? null,
    callSid: input.callSid ?? existing?.callSid ?? null,
    parentCallSid: input.parentCallSid ?? existing?.parentCallSid ?? null,
    childCallSid: input.childCallSid ?? existing?.childCallSid ?? null,
    direction: toDbDirection(input.direction) ?? existing?.direction ?? null,
    externalParticipantE164: input.externalParticipantE164 ?? existing?.externalParticipantE164 ?? null,
    lastActorUserId: input.lastActorUserId ?? existing?.lastActorUserId ?? null,
    lastActorDeviceId: input.lastActorDeviceId ?? existing?.lastActorDeviceId ?? null,
  };
}

export function shouldAdvanceCallSessionTransition(
  currentState: CallSessionState,
  currentOccurredAt: Date,
  nextState: CallSessionState,
  nextOccurredAt: Date
): boolean {
  const currentPrecedence = callSessionStatePrecedence[currentState];
  const nextPrecedence = callSessionStatePrecedence[nextState];
  if (nextPrecedence > currentPrecedence) {
    return nextOccurredAt.getTime() >= currentOccurredAt.getTime();
  }

  if (nextPrecedence < currentPrecedence) {
    return false;
  }

  return nextOccurredAt.getTime() > currentOccurredAt.getTime();
}

export function shouldEnrichEqualTimestampFailure(
  currentState: CallSessionState,
  currentOccurredAt: Date,
  nextState: CallSessionState,
  nextOccurredAt: Date,
  errorCode?: NormalizedErrorCode | null,
  errorMessage?: string | null
): boolean {
  return (
    callSessionStatePrecedence[currentState] === callSessionStatePrecedence[nextState] &&
    currentOccurredAt.getTime() === nextOccurredAt.getTime() &&
    nextState === CallSessionState.FAILED &&
    (errorCode != null || errorMessage != null)
  );
}

async function findCandidateSession(input: UpsertCallSessionTransitionInput): Promise<CallSession | null> {
  const sidCandidates = [...new Set([input.callSid, input.parentCallSid, input.childCallSid].filter((sid): sid is string => Boolean(sid)))];
  if (sidCandidates.length > 0) {
    const exact = await prisma.callSession.findFirst({
      where: {
        businessId: input.businessId,
        OR: sidCandidates.flatMap((sid) => [{ callSid: sid }, { parentCallSid: sid }, { childCallSid: sid }]),
      },
      orderBy: { updatedAt: "desc" },
    });
    if (exact) {
      return exact;
    }
  }

  const windowStart = new Date(input.occurredAt.getTime() - PENDING_SESSION_WINDOW_MS);
  return prisma.callSession.findFirst({
    where: {
      businessId: input.businessId,
      callSid: null,
      lastActorDeviceId: input.lastActorDeviceId ?? undefined,
      direction: toDbDirection(input.direction) ?? undefined,
      externalParticipantE164: input.externalParticipantE164 ?? undefined,
      state: { in: [...pendingSessionStates, CallSessionState.ACTIVE] },
      updatedAt: { gte: windowStart },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function cleanupExpiredCallSessions(businessId: string): Promise<void> {
  await prisma.callSession.deleteMany({
    where: {
      businessId,
      retainUntil: {
        lt: new Date(),
      },
    },
  });
}

export async function upsertCallSessionTransition(input: UpsertCallSessionTransitionInput): Promise<CallSession> {
  const nextState = toDbState(input.state);
  const existing = await findCandidateSession(input);
  const metadata = mergeMetadata(existing, input);

  if (!existing) {
    return prisma.callSession.create({
      data: {
        businessId: input.businessId,
        phoneNumberId: metadata.phoneNumberId,
        callSid: metadata.callSid,
        parentCallSid: metadata.parentCallSid,
        childCallSid: metadata.childCallSid,
        direction: metadata.direction,
        state: nextState,
        source: toDbSource(input.source),
        externalParticipantE164: metadata.externalParticipantE164,
        lastActorUserId: metadata.lastActorUserId,
        lastActorDeviceId: metadata.lastActorDeviceId,
        lastTransitionAt: input.occurredAt,
        startedAt: input.state === "incoming" || input.state === "outgoing_dialing" ? input.occurredAt : null,
        answeredAt: input.state === "active" ? input.occurredAt : null,
        endedAt: shouldRetain(nextState) ? input.occurredAt : null,
        retainUntil: retentionDate(input.occurredAt, nextState),
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      },
    });
  }

  const existingAt = existing.lastTransitionAt.getTime();
  const incomingAt = input.occurredAt.getTime();
  const equalPrecedence = callSessionStatePrecedence[existing.state] === callSessionStatePrecedence[nextState];
  const enrichFailureOnly = shouldEnrichEqualTimestampFailure(
    existing.state,
    existing.lastTransitionAt,
    nextState,
    input.occurredAt,
    input.errorCode,
    input.errorMessage
  );

  const baseUpdate: Prisma.CallSessionUpdateInput = {
    phoneNumber: metadata.phoneNumberId ? { connect: { id: metadata.phoneNumberId } } : undefined,
    callSid: metadata.callSid,
    parentCallSid: metadata.parentCallSid,
    childCallSid: metadata.childCallSid,
    direction: metadata.direction,
    source: toDbSource(input.source),
    externalParticipantE164: metadata.externalParticipantE164,
    lastActorUserId: metadata.lastActorUserId,
    lastActorDeviceId: metadata.lastActorDeviceId,
  };

  if (enrichFailureOnly) {
    return prisma.callSession.update({
      where: { id: existing.id },
      data: {
        ...baseUpdate,
        errorCode: input.errorCode ?? existing.errorCode,
        errorMessage: input.errorMessage ?? existing.errorMessage,
      },
    });
  }

  if (!shouldAdvanceCallSessionTransition(existing.state, existing.lastTransitionAt, nextState, input.occurredAt)) {
    return prisma.callSession.update({
      where: { id: existing.id },
      data: baseUpdate,
    });
  }

  return prisma.callSession.update({
    where: { id: existing.id },
    data: {
      ...baseUpdate,
      state: nextState,
      lastTransitionAt: input.occurredAt,
      answeredAt:
        nextState === CallSessionState.ACTIVE ? input.occurredAt : existing.answeredAt,
      endedAt: shouldRetain(nextState) ? input.occurredAt : null,
      retainUntil: retentionDate(input.occurredAt, nextState),
      errorCode: input.errorCode ?? existing.errorCode,
      errorMessage: input.errorMessage ?? existing.errorMessage,
    },
  });
}

type PreferredCallSessionInput = {
  businessId: string;
  deviceId?: string | null;
};

export async function getPreferredCallSession(input: PreferredCallSessionInput): Promise<CallSession | null> {
  await cleanupExpiredCallSessions(input.businessId);

  const now = new Date();
  const liveWhere = {
    businessId: input.businessId,
    state: { in: liveSessionStates },
  } satisfies Prisma.CallSessionWhereInput;
  const retainedWhere = {
    businessId: input.businessId,
    state: { in: [CallSessionState.ENDED, CallSessionState.FAILED] },
    retainUntil: { gt: now },
  } satisfies Prisma.CallSessionWhereInput;

  if (input.deviceId) {
    const liveForDevice = await prisma.callSession.findFirst({
      where: {
        ...liveWhere,
        lastActorDeviceId: input.deviceId,
      },
      orderBy: [{ updatedAt: "desc" }],
    });
    if (liveForDevice) return liveForDevice;
  }

  const liveAny = await prisma.callSession.findFirst({
    where: liveWhere,
    orderBy: [{ updatedAt: "desc" }],
  });
  if (liveAny) return liveAny;

  if (input.deviceId) {
    const retainedForDevice = await prisma.callSession.findFirst({
      where: {
        ...retainedWhere,
        lastActorDeviceId: input.deviceId,
      },
      orderBy: [{ updatedAt: "desc" }],
    });
    if (retainedForDevice) return retainedForDevice;
  }

  return prisma.callSession.findFirst({
    where: retainedWhere,
    orderBy: [{ updatedAt: "desc" }],
  });
}

export function isPendingPersistedCallSessionState(state: PersistedCallSessionState): boolean {
  return state === "incoming" || state === "answering" || state === "outgoing_dialing" || state === "connecting";
}
