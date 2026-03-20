import {
  CallEventType,
  HistorySyncJobStatus,
  MessageDeliveryStatus,
  ThreadItemType,
  UnreadState,
  type PhoneNumber,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { optionalE164 } from "../../lib/phone.js";
import { twilioClient } from "../../lib/twilio.js";
import { requirePrimaryPhoneNumberForBusiness } from "../phoneNumbers/service.js";
import { ensureThread, projectThreadItem } from "../threads/service.js";

type HistorySyncState = "idle" | "syncing" | "completed" | "failed";

type HistorySyncSnapshot = {
  state: HistorySyncState;
  startedAt: string | null;
  completedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  errorMessage: string | null;
  importedMessages: number;
  importedCalls: number;
  importedVoicemails: number;
};

type TwilioHistoryMessage = {
  sid: string;
  from: string | null;
  to: string | null;
  body: string | null;
  status: string | null;
  dateSent: Date | null;
  errorCode: number | null;
};

type TwilioHistoryCall = {
  sid: string;
  from: string | null;
  to: string | null;
  status: string | null;
  direction: string | null;
  parentCallSid: string | null;
  startTime: Date | null;
  endTime: Date | null;
  dateCreated: Date;
  duration: string | null;
};

type TwilioHistoryRecording = {
  sid: string;
  callSid: string;
  mediaUrl: string;
  duration: string;
  startTime: Date | null;
  dateCreated: Date;
};

type ImportedCallContext = {
  externalParticipantE164: string;
  direction: "inbound" | "outbound";
  occurredAt: Date;
  phoneNumberId: string;
};

type HistorySyncAvailability = {
  isSyncAvailable: boolean;
  unavailableReason: string | null;
  primaryPhoneNumberId: string | null;
  primaryPhoneNumberE164: string | null;
};

const SYNC_LOOKBACK_DAYS = 180;
const SYNC_LIMIT_PER_COLLECTION = 200;
const INTERRUPTED_SYNC_MESSAGE = "History sync was interrupted by an API restart. Run sync again.";

const runningSyncs = new Map<string, Promise<void>>();

function nowIso() {
  return new Date().toISOString();
}

function defaultSnapshot(): HistorySyncSnapshot {
  return {
    state: "idle",
    startedAt: null,
    completedAt: null,
    lastSuccessfulSyncAt: null,
    errorMessage: null,
    importedMessages: 0,
    importedCalls: 0,
    importedVoicemails: 0,
  };
}

function fromDbStatus(status: HistorySyncJobStatus): HistorySyncState {
  switch (status) {
    case HistorySyncJobStatus.SYNCING:
      return "syncing";
    case HistorySyncJobStatus.COMPLETED:
      return "completed";
    case HistorySyncJobStatus.FAILED:
      return "failed";
    default:
      return "idle";
  }
}

function toDbStatus(state: HistorySyncState): HistorySyncJobStatus {
  switch (state) {
    case "syncing":
      return HistorySyncJobStatus.SYNCING;
    case "completed":
      return HistorySyncJobStatus.COMPLETED;
    case "failed":
      return HistorySyncJobStatus.FAILED;
    default:
      return HistorySyncJobStatus.IDLE;
  }
}

function jobToSnapshot(
  job:
    | {
        status: HistorySyncJobStatus;
        startedAt: Date | null;
        completedAt: Date | null;
        lastSuccessfulSyncAt: Date | null;
        errorMessage: string | null;
        importedMessages: number;
        importedCalls: number;
        importedVoicemails: number;
      }
    | null
): HistorySyncSnapshot {
  if (!job) {
    return defaultSnapshot();
  }

  return {
    state: fromDbStatus(job.status),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    lastSuccessfulSyncAt: job.lastSuccessfulSyncAt?.toISOString() ?? null,
    errorMessage: job.errorMessage ?? null,
    importedMessages: job.importedMessages,
    importedCalls: job.importedCalls,
    importedVoicemails: job.importedVoicemails,
  };
}

async function getSnapshot(businessId: string): Promise<HistorySyncSnapshot> {
  const job = await prisma.historySyncJob.findUnique({
    where: { businessId },
  });
  return jobToSnapshot(job);
}

async function setSnapshot(businessId: string, next: HistorySyncSnapshot): Promise<void> {
  await prisma.historySyncJob.upsert({
    where: { businessId },
    create: {
      businessId,
      status: toDbStatus(next.state),
      startedAt: next.startedAt ? new Date(next.startedAt) : null,
      completedAt: next.completedAt ? new Date(next.completedAt) : null,
      lastSuccessfulSyncAt: next.lastSuccessfulSyncAt ? new Date(next.lastSuccessfulSyncAt) : null,
      errorMessage: next.errorMessage,
      importedMessages: next.importedMessages,
      importedCalls: next.importedCalls,
      importedVoicemails: next.importedVoicemails,
    },
    update: {
      status: toDbStatus(next.state),
      startedAt: next.startedAt ? new Date(next.startedAt) : null,
      completedAt: next.completedAt ? new Date(next.completedAt) : null,
      lastSuccessfulSyncAt: next.lastSuccessfulSyncAt ? new Date(next.lastSuccessfulSyncAt) : null,
      errorMessage: next.errorMessage,
      importedMessages: next.importedMessages,
      importedCalls: next.importedCalls,
      importedVoicemails: next.importedVoicemails,
    },
  });
}

async function markInterruptedSyncIfNeeded(businessId: string): Promise<void> {
  if (runningSyncs.has(businessId)) {
    return;
  }

  const job = await prisma.historySyncJob.findUnique({
    where: { businessId },
  });

  if (!job || job.status !== HistorySyncJobStatus.SYNCING) {
    return;
  }

  await prisma.historySyncJob.update({
    where: { businessId },
    data: {
      status: HistorySyncJobStatus.FAILED,
      completedAt: new Date(),
      errorMessage: INTERRUPTED_SYNC_MESSAGE,
    },
  });
}

async function getAvailability(businessId: string): Promise<HistorySyncAvailability> {
  const primaryPhoneNumber = await requirePrimaryPhoneNumberForBusiness(businessId).catch(() => null);
  if (!primaryPhoneNumber) {
    return {
      isSyncAvailable: false,
      unavailableReason: "Add a business phone number before syncing history.",
      primaryPhoneNumberId: null,
      primaryPhoneNumberE164: null,
    };
  }

  return {
    isSyncAvailable: Boolean(twilioClient),
    unavailableReason: twilioClient ? null : "Twilio account history sync needs ACCOUNT SID and AUTH TOKEN configured.",
    primaryPhoneNumberId: primaryPhoneNumber.id,
    primaryPhoneNumberE164: primaryPhoneNumber.e164,
  };
}

function mergeUniqueBySid<T extends { sid: string }>(items: T[]): T[] {
  const bySid = new Map<string, T>();
  for (const item of items) {
    bySid.set(item.sid, item);
  }
  return Array.from(bySid.values());
}

function deliveryStatusFromTwilioStatus(status: string | null): MessageDeliveryStatus {
  switch ((status ?? "").toLowerCase()) {
    case "delivered":
    case "received":
      return MessageDeliveryStatus.DELIVERED;
    case "failed":
    case "undelivered":
      return MessageDeliveryStatus.FAILED;
    case "sent":
      return MessageDeliveryStatus.SENT;
    case "queued":
    case "accepted":
    case "scheduled":
      return MessageDeliveryStatus.QUEUED;
    default:
      return MessageDeliveryStatus.SENT;
  }
}

function callEventTypeFromStatus(status: string | null): CallEventType | null {
  switch ((status ?? "").toLowerCase()) {
    case "busy":
    case "no-answer":
    case "failed":
      return CallEventType.MISSED_CALL;
    case "canceled":
      return CallEventType.CALL_DECLINED;
    case "completed":
      return CallEventType.CALL_COMPLETED;
    default:
      return null;
  }
}

function threadItemTypeFromCallEventType(eventType: CallEventType): ThreadItemType {
  switch (eventType) {
    case CallEventType.MISSED_CALL:
      return ThreadItemType.MISSED_CALL;
    case CallEventType.CALL_DECLINED:
      return ThreadItemType.CALL_DECLINED;
    case CallEventType.CALL_COMPLETED:
      return ThreadItemType.CALL_COMPLETED;
  }
}

function occurredAtForCall(input: TwilioHistoryCall): Date {
  return input.endTime ?? input.startTime ?? input.dateCreated;
}

function syncWindowStart(snapshot: HistorySyncSnapshot): Date {
  if (snapshot.lastSuccessfulSyncAt) {
    return new Date(new Date(snapshot.lastSuccessfulSyncAt).getTime() - 24 * 60 * 60 * 1000);
  }
  return new Date(Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}

async function listMessagesForPhone(phoneNumber: PhoneNumber, startDate: Date): Promise<TwilioHistoryMessage[]> {
  const [sent, received] = await Promise.all([
    twilioClient!.messages.list({
      from: phoneNumber.e164,
      dateSentAfter: startDate,
      limit: SYNC_LIMIT_PER_COLLECTION,
    }) as Promise<TwilioHistoryMessage[]>,
    twilioClient!.messages.list({
      to: phoneNumber.e164,
      dateSentAfter: startDate,
      limit: SYNC_LIMIT_PER_COLLECTION,
    }) as Promise<TwilioHistoryMessage[]>,
  ]);

  return mergeUniqueBySid([...sent, ...received]).sort((left, right) => {
    const leftAt = (left.dateSent ?? new Date(0)).getTime();
    const rightAt = (right.dateSent ?? new Date(0)).getTime();
    return leftAt - rightAt;
  });
}

async function listCallsForPhone(phoneNumber: PhoneNumber, startDate: Date): Promise<TwilioHistoryCall[]> {
  const [outbound, inbound] = await Promise.all([
    twilioClient!.calls.list({
      from: phoneNumber.e164,
      startTimeAfter: startDate,
      limit: SYNC_LIMIT_PER_COLLECTION,
    }) as Promise<TwilioHistoryCall[]>,
    twilioClient!.calls.list({
      to: phoneNumber.e164,
      startTimeAfter: startDate,
      limit: SYNC_LIMIT_PER_COLLECTION,
    }) as Promise<TwilioHistoryCall[]>,
  ]);

  return mergeUniqueBySid([...outbound, ...inbound]).sort((left, right) => occurredAtForCall(left).getTime() - occurredAtForCall(right).getTime());
}

async function listRecordingsForCalls(startDate: Date): Promise<TwilioHistoryRecording[]> {
  const recordings = (await twilioClient!.recordings.list({
    dateCreatedAfter: startDate,
    limit: SYNC_LIMIT_PER_COLLECTION,
  })) as TwilioHistoryRecording[];

  return mergeUniqueBySid(recordings).sort((left, right) => {
    const leftAt = (left.startTime ?? left.dateCreated).getTime();
    const rightAt = (right.startTime ?? right.dateCreated).getTime();
    return leftAt - rightAt;
  });
}

async function syncHistoryMessage(businessId: string, phoneNumber: PhoneNumber, message: TwilioHistoryMessage): Promise<boolean> {
  const from = optionalE164(message.from ?? undefined);
  const to = optionalE164(message.to ?? undefined);
  const occurredAt = message.dateSent ?? new Date();
  if (!from || !to) {
    return false;
  }

  let externalParticipantE164: string;
  let direction: "INBOUND" | "OUTBOUND";
  let itemType: ThreadItemType;
  if (to === phoneNumber.e164) {
    externalParticipantE164 = from;
    direction = "INBOUND";
    itemType = ThreadItemType.SMS_INBOUND;
  } else if (from === phoneNumber.e164) {
    externalParticipantE164 = to;
    direction = "OUTBOUND";
    itemType = ThreadItemType.SMS_OUTBOUND;
  } else {
    return false;
  }

  const thread = await ensureThread({
    businessId,
    phoneNumberId: phoneNumber.id,
    externalParticipantE164,
  });

  const savedMessage = await prisma.message.upsert({
    where: {
      messageSid: message.sid,
    },
    create: {
      businessId,
      phoneNumberId: phoneNumber.id,
      threadId: thread.id,
      externalParticipantE164,
      direction,
      messageSid: message.sid,
      body: message.body ?? "",
      mediaUrls: [],
      deliveryStatus: deliveryStatusFromTwilioStatus(message.status),
      providerStatus: message.status ?? null,
      errorCode: message.errorCode ? "SMS_SEND_ERROR" : null,
    },
    update: {
      threadId: thread.id,
      externalParticipantE164,
      body: message.body ?? "",
      deliveryStatus: deliveryStatusFromTwilioStatus(message.status),
      providerStatus: message.status ?? null,
      errorCode: message.errorCode ? "SMS_SEND_ERROR" : null,
    },
  });

  await projectThreadItem({
    businessId,
    phoneNumberId: phoneNumber.id,
    externalParticipantE164,
    itemType,
    unreadState: UnreadState.READ,
    payloadRefType: "MESSAGE",
    payloadRefId: savedMessage.id,
    dedupeKey: `message:${savedMessage.id}`,
    occurredAt,
    previewText: savedMessage.body,
  });

  return true;
}

async function syncHistoryCall(
  businessId: string,
  phoneNumber: PhoneNumber,
  call: TwilioHistoryCall
): Promise<ImportedCallContext | null> {
  const from = optionalE164(call.from ?? undefined);
  const to = optionalE164(call.to ?? undefined);
  const eventType = callEventTypeFromStatus(call.status);
  if (!eventType || !from || !to) {
    return null;
  }

  let externalParticipantE164: string;
  let direction: "inbound" | "outbound";
  if (to === phoneNumber.e164) {
    externalParticipantE164 = from;
    direction = "inbound";
  } else if (from === phoneNumber.e164) {
    externalParticipantE164 = to;
    direction = "outbound";
  } else {
    return null;
  }

  const thread = await ensureThread({
    businessId,
    phoneNumberId: phoneNumber.id,
    externalParticipantE164,
  });
  const occurredAt = occurredAtForCall(call);
  const durationSeconds = call.duration != null ? Number.parseInt(call.duration, 10) || null : null;

  const callEvent = await prisma.callEvent.upsert({
    where: {
      businessId_callSid_eventType: {
        businessId,
        callSid: call.sid,
        eventType,
      },
    },
    create: {
      businessId,
      phoneNumberId: phoneNumber.id,
      threadId: thread.id,
      externalParticipantE164,
      eventType,
      direction: direction === "inbound" ? "INBOUND" : "OUTBOUND",
      callSid: call.sid,
      parentCallSid: call.parentCallSid ?? null,
      providerStatus: call.status ?? null,
      startedAt: call.startTime ?? call.dateCreated,
      endedAt: call.endTime ?? occurredAt,
      durationSeconds,
    },
    update: {
      threadId: thread.id,
      externalParticipantE164,
      direction: direction === "inbound" ? "INBOUND" : "OUTBOUND",
      parentCallSid: call.parentCallSid ?? null,
      providerStatus: call.status ?? null,
      startedAt: call.startTime ?? call.dateCreated,
      endedAt: call.endTime ?? occurredAt,
      durationSeconds,
    },
  });

  await projectThreadItem({
    businessId,
    phoneNumberId: phoneNumber.id,
    externalParticipantE164,
    itemType: threadItemTypeFromCallEventType(eventType),
    unreadState: UnreadState.READ,
    payloadRefType: "CALL_EVENT",
    payloadRefId: callEvent.id,
    dedupeKey: `call-event:${callEvent.id}`,
    occurredAt,
    previewText:
      eventType === CallEventType.CALL_COMPLETED
        ? "Call completed"
        : eventType === CallEventType.CALL_DECLINED
          ? "Call declined"
          : "Missed call",
  });

  return {
    externalParticipantE164,
    direction,
    occurredAt,
    phoneNumberId: phoneNumber.id,
  };
}

async function resolveImportedCallContext(
  businessId: string,
  phoneNumber: PhoneNumber,
  recording: TwilioHistoryRecording,
  importedCalls: Map<string, ImportedCallContext>
): Promise<ImportedCallContext | null> {
  const imported = importedCalls.get(recording.callSid);
  if (imported) {
    return imported;
  }

  const existingCallEvent = await prisma.callEvent.findFirst({
    where: {
      businessId,
      callSid: recording.callSid,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!existingCallEvent) {
    return null;
  }

  return {
    externalParticipantE164: existingCallEvent.externalParticipantE164,
    direction: existingCallEvent.direction === "INBOUND" ? "inbound" : "outbound",
    occurredAt: existingCallEvent.endedAt ?? existingCallEvent.startedAt ?? existingCallEvent.createdAt,
    phoneNumberId: phoneNumber.id,
  };
}

async function syncHistoryRecording(
  businessId: string,
  phoneNumber: PhoneNumber,
  recording: TwilioHistoryRecording,
  importedCalls: Map<string, ImportedCallContext>
): Promise<boolean> {
  const importedCallContext = await resolveImportedCallContext(businessId, phoneNumber, recording, importedCalls);
  if (!importedCallContext) {
    return false;
  }

  const thread = await ensureThread({
    businessId,
    phoneNumberId: phoneNumber.id,
    externalParticipantE164: importedCallContext.externalParticipantE164,
  });
  const occurredAt = recording.startTime ?? recording.dateCreated;

  const voicemail = await prisma.voicemail.upsert({
    where: {
      businessId_callSid: {
        businessId,
        callSid: recording.callSid,
      },
    },
    create: {
      businessId,
      phoneNumberId: phoneNumber.id,
      threadId: thread.id,
      externalParticipantE164: importedCallContext.externalParticipantE164,
      callSid: recording.callSid,
      recordingSid: recording.sid,
      recordingUrl: recording.mediaUrl,
      durationSeconds: Number.parseInt(recording.duration, 10) || null,
      transcriptStatus: "NOT_REQUESTED",
    },
    update: {
      threadId: thread.id,
      externalParticipantE164: importedCallContext.externalParticipantE164,
      recordingSid: recording.sid,
      recordingUrl: recording.mediaUrl,
      durationSeconds: Number.parseInt(recording.duration, 10) || null,
    },
  });

  await projectThreadItem({
    businessId,
    phoneNumberId: phoneNumber.id,
    externalParticipantE164: importedCallContext.externalParticipantE164,
    itemType: ThreadItemType.VOICEMAIL,
    unreadState: UnreadState.HEARD,
    payloadRefType: "VOICEMAIL",
    payloadRefId: voicemail.id,
    dedupeKey: `voicemail:${voicemail.id}`,
    occurredAt,
    previewText: "Voicemail",
  });

  return true;
}

async function runHistorySync(businessId: string): Promise<void> {
  const previousSnapshot = await getSnapshot(businessId);
  const phoneNumber = await requirePrimaryPhoneNumberForBusiness(businessId);
  if (!twilioClient) {
    throw new AppError(503, "internal_error", "Twilio account history sync needs ACCOUNT SID and AUTH TOKEN configured.");
  }

  const importedCalls = new Map<string, ImportedCallContext>();
  const startDate = syncWindowStart(previousSnapshot);
  const [messages, calls, recordings] = await Promise.all([
    listMessagesForPhone(phoneNumber, startDate),
    listCallsForPhone(phoneNumber, startDate),
    listRecordingsForCalls(startDate),
  ]);

  let importedMessages = 0;
  for (const message of messages) {
    if (await syncHistoryMessage(businessId, phoneNumber, message)) {
      importedMessages += 1;
    }
  }

  let importedCallsCount = 0;
  for (const call of calls) {
    const imported = await syncHistoryCall(businessId, phoneNumber, call);
    if (imported) {
      importedCalls.set(call.sid, imported);
      importedCallsCount += 1;
    }
  }

  let importedVoicemails = 0;
  for (const recording of recordings) {
    if (await syncHistoryRecording(businessId, phoneNumber, recording, importedCalls)) {
      importedVoicemails += 1;
    }
  }

  const completedAt = nowIso();
  await setSnapshot(businessId, {
    state: "completed",
    startedAt: previousSnapshot.startedAt,
    completedAt,
    lastSuccessfulSyncAt: completedAt,
    errorMessage: null,
    importedMessages,
    importedCalls: importedCallsCount,
    importedVoicemails,
  });
}

export async function getHistorySyncStatus(businessId: string) {
  await markInterruptedSyncIfNeeded(businessId);
  const snapshot = await getSnapshot(businessId);
  const availability = await getAvailability(businessId);
  return {
    ...snapshot,
    ...availability,
  };
}

export async function startHistorySync(businessId: string) {
  const availability = await getAvailability(businessId);
  if (!availability.isSyncAvailable) {
    throw new AppError(400, "bad_request", availability.unavailableReason ?? "History sync is not available yet.");
  }

  await markInterruptedSyncIfNeeded(businessId);

  if (runningSyncs.has(businessId)) {
    return getHistorySyncStatus(businessId);
  }

  const previousSnapshot = await getSnapshot(businessId);
  const startedAt = nowIso();
  await setSnapshot(businessId, {
    state: "syncing",
    startedAt,
    completedAt: null,
    lastSuccessfulSyncAt: previousSnapshot.lastSuccessfulSyncAt,
    errorMessage: null,
    importedMessages: 0,
    importedCalls: 0,
    importedVoicemails: 0,
  });

  const promise = runHistorySync(businessId)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "History sync failed";
      return getSnapshot(businessId).then((snapshot) =>
        setSnapshot(businessId, {
        ...snapshot,
        state: "failed",
        completedAt: nowIso(),
        errorMessage: message,
        })
      );
    })
    .finally(() => {
      runningSyncs.delete(businessId);
    });

  runningSyncs.set(businessId, promise);
  void promise;
  return getHistorySyncStatus(businessId);
}
