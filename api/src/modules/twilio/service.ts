import twilio from "twilio";
import { MessageDeliveryStatus, ThreadItemType, UnreadState, VoicemailTranscriptionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { normalizeToE164, optionalE164 } from "../../lib/phone.js";
import { projectThreadItem, syncNotificationStateForBusiness } from "../threads/service.js";
import { resolveBusinessPhoneNumberByE164 } from "../phoneNumbers/service.js";
import { requireApiBaseUrl } from "../../lib/env.js";
import { emitToBusiness } from "../../lib/socket.js";
import { voiceStatusCallbackUrl } from "../../lib/twilio.js";
import { fromDbState, upsertCallSessionTransition } from "../calls/sessionService.js";

type ProviderEventInput = {
  businessId?: string | null;
  eventType: string;
  dedupeKey: string;
  rawPayload: Record<string, string | undefined>;
  callSid?: string | null;
  messageSid?: string | null;
  recordingSid?: string | null;
  transcriptionProviderId?: string | null;
};

export async function recordProviderEvent(input: ProviderEventInput) {
  return prisma.providerEvent.upsert({
    where: {
      provider_dedupeKey: {
        provider: "TWILIO",
        dedupeKey: input.dedupeKey,
      },
    },
    create: {
      businessId: input.businessId ?? null,
      provider: "TWILIO",
      eventType: input.eventType,
      dedupeKey: input.dedupeKey,
      callSid: input.callSid ?? null,
      messageSid: input.messageSid ?? null,
      recordingSid: input.recordingSid ?? null,
      transcriptionProviderId: input.transcriptionProviderId ?? null,
      rawPayload: input.rawPayload,
      status: "RECEIVED",
    },
    update: {
      rawPayload: input.rawPayload,
      callSid: input.callSid ?? null,
      messageSid: input.messageSid ?? null,
      recordingSid: input.recordingSid ?? null,
      transcriptionProviderId: input.transcriptionProviderId ?? null,
    },
  });
}

export function parseIdentity(identity: string | undefined): { businessId: string; userId: string } | null {
  if (!identity) return null;
  const match = /^business_(.+)_user_(.+)$/.exec(identity.trim());
  if (!match) return null;
  return {
    businessId: match[1] ?? "",
    userId: match[2] ?? "",
  };
}

export async function resolveBusinessPhoneByIncomingNumber(toNumber: string | undefined) {
  if (!toNumber) return null;
  return resolveBusinessPhoneNumberByE164(normalizeToE164(toNumber));
}

type VoiceStatusEventType = "MISSED_CALL" | "CALL_DECLINED" | "CALL_COMPLETED";
type PersistedVoiceProgressState = "connecting" | "active";

export type NormalizedVoiceStatusPayload = {
  businessId: string | null;
  phoneNumberId: string | null;
  externalParticipantE164: string | null;
  occurredAt: Date;
  rawCallSid: string | null;
  sessionCallSid: string | null;
  callEventSid: string | null;
  parentCallSid: string | null;
  childCallSid: string | null;
  callStatus: string | null;
  dialCallStatus: string | null;
  providerStatus: string | null;
  callbackSource: string | null;
  direction: "inbound" | "outbound" | null;
  eventType: VoiceStatusEventType | null;
  progressState: PersistedVoiceProgressState | null;
};

function normalizeVoiceDirection(payload: Record<string, string | undefined>): "inbound" | "outbound" | null {
  const rawDirection = payload.Direction?.trim().toLowerCase();
  if (rawDirection?.includes("outbound")) {
    return "outbound";
  }
  if (rawDirection?.includes("inbound")) {
    return "inbound";
  }
  const identity = parseIdentity(payload.From?.replace(/^client:/i, "") ?? payload.Identity);
  return identity ? "outbound" : null;
}

function parseTwilioTimestamp(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeVoiceStatusPayload(payload: Record<string, string | undefined>): NormalizedVoiceStatusPayload {
  const rawCallSid = payload.CallSid?.trim() ?? payload.callSid?.trim() ?? null;
  const dialCallSid = payload.DialCallSid?.trim() ?? null;
  const parentCallSid = payload.ParentCallSid?.trim() ?? (dialCallSid ? rawCallSid : null);
  const childCallSid = payload.ChildCallSid?.trim() ?? dialCallSid ?? (payload.ParentCallSid?.trim() ? rawCallSid : null);
  const sessionCallSid = parentCallSid ?? rawCallSid;
  const callEventSid = childCallSid ?? sessionCallSid;
  const dialCallStatus = payload.DialCallStatus?.trim().toLowerCase() || null;
  const callStatus = payload.CallStatus?.trim().toLowerCase() || null;
  const providerStatus = callStatus ?? dialCallStatus;
  const callbackSource = payload.CallbackSource?.trim() || null;
  const eventType =
    dialCallStatus === "busy" || dialCallStatus === "no-answer" || dialCallStatus === "failed" || callStatus === "busy" || callStatus === "no-answer" || callStatus === "failed"
      ? "MISSED_CALL"
      : dialCallStatus === "canceled" || callStatus === "canceled"
        ? "CALL_DECLINED"
        : callStatus === "completed" || dialCallStatus === "completed"
          ? "CALL_COMPLETED"
          : null;
  const progressState =
    callStatus === "queued" || callStatus === "initiated" || callStatus === "ringing"
      ? "connecting"
      : callStatus === "in-progress"
        ? "active"
        : null;

  return {
    businessId: payload.businessId ?? payload.BusinessId ?? null,
    phoneNumberId: payload.phoneNumberId ?? payload.PhoneNumberId ?? null,
    externalParticipantE164: optionalE164(payload.externalParticipantE164 ?? payload.ExternalParticipantE164 ?? payload.From ?? payload.To),
    occurredAt: parseTwilioTimestamp(payload.Timestamp) ?? new Date(),
    rawCallSid,
    sessionCallSid,
    callEventSid,
    parentCallSid,
    childCallSid,
    callStatus,
    dialCallStatus,
    providerStatus,
    callbackSource,
    direction: normalizeVoiceDirection(payload),
    eventType,
    progressState,
  };
}

export function buildIncomingVoiceResponse(input: {
  businessId: string;
  phoneNumberId: string;
  externalParticipantE164: string;
  identities: string[];
}) {
  const response = new twilio.twiml.VoiceResponse();
  if (input.identities.length === 0) {
    response.say("No agents are available.");
    return response;
  }

  const actionUrl = new URL(`${requireApiBaseUrl()}/webhooks/twilio/voice/status`);
  actionUrl.searchParams.set("businessId", input.businessId);
  actionUrl.searchParams.set("phoneNumberId", input.phoneNumberId);
  actionUrl.searchParams.set("externalParticipantE164", input.externalParticipantE164);

  const dial = response.dial({
    timeout: 25,
    answerOnBridge: true,
    action: actionUrl.toString(),
    method: "POST",
  });

  for (const identity of input.identities) {
    dial.client(identity);
  }

  return response;
}

export function buildOutboundVoiceResponse(input: {
  to: string;
  callerId: string;
  businessId: string;
  phoneNumberId: string;
  externalParticipantE164: string;
}) {
  const response = new twilio.twiml.VoiceResponse();
  const actionUrl = new URL(`${requireApiBaseUrl()}/webhooks/twilio/voice/status`);
  actionUrl.searchParams.set("businessId", input.businessId);
  actionUrl.searchParams.set("phoneNumberId", input.phoneNumberId);
  actionUrl.searchParams.set("externalParticipantE164", input.externalParticipantE164);
  const statusCallbackParams = new URLSearchParams();
  statusCallbackParams.set("businessId", input.businessId);
  statusCallbackParams.set("phoneNumberId", input.phoneNumberId);
  statusCallbackParams.set("externalParticipantE164", input.externalParticipantE164);

  const dial = response.dial({
    callerId: input.callerId,
    answerOnBridge: true,
    action: actionUrl.toString(),
    method: "POST",
  });
  dial.number(
    {
      statusCallback: voiceStatusCallbackUrl(statusCallbackParams),
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    },
    input.to
  );
  return response;
}

export async function buildVoicemailFallbackResponse(input: {
  businessId: string;
  phoneNumberId: string;
  externalParticipantE164: string;
  callSid: string | undefined;
}) {
  const greeting = await prisma.voicemailGreeting.findFirst({
    where: {
      businessId: input.businessId,
      phoneNumberId: input.phoneNumberId,
      isActive: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const response = new twilio.twiml.VoiceResponse();
  if (greeting?.mode === "RECORDED" && greeting.audioUrl) {
    response.play(greeting.audioUrl);
  } else {
    response.say(greeting?.ttsText?.trim() || "Please leave a message after the tone.");
  }

  const recordingStatusCallback = new URL(`${requireApiBaseUrl()}/webhooks/twilio/voice/recording`);
  recordingStatusCallback.searchParams.set("businessId", input.businessId);
  recordingStatusCallback.searchParams.set("phoneNumberId", input.phoneNumberId);
  recordingStatusCallback.searchParams.set("externalParticipantE164", input.externalParticipantE164);
  if (input.callSid) {
    recordingStatusCallback.searchParams.set("callSid", input.callSid);
  }

  const transcriptionCallback = new URL(`${requireApiBaseUrl()}/webhooks/twilio/voice/transcription`);
  transcriptionCallback.searchParams.set("businessId", input.businessId);
  transcriptionCallback.searchParams.set("phoneNumberId", input.phoneNumberId);
  transcriptionCallback.searchParams.set("externalParticipantE164", input.externalParticipantE164);
  if (input.callSid) {
    transcriptionCallback.searchParams.set("callSid", input.callSid);
  }

  response.record({
    maxLength: 180,
    playBeep: true,
    transcribe: true,
    recordingStatusCallback: recordingStatusCallback.toString(),
    transcribeCallback: transcriptionCallback.toString(),
  });
  return response;
}

export async function handleInboundSms(payload: Record<string, string | undefined>) {
  const from = optionalE164(payload.From);
  const to = optionalE164(payload.To);
  const messageSid = payload.MessageSid?.trim();
  if (!from || !to || !messageSid) {
    throw new AppError(400, "bad_request", "Inbound SMS payload is incomplete");
  }

  const phoneNumber = await resolveBusinessPhoneNumberByE164(to);
  if (!phoneNumber) {
    throw new AppError(404, "not_found", "Business phone number was not found");
  }

  await recordProviderEvent({
    businessId: phoneNumber.businessId,
    eventType: "sms.inbound",
    dedupeKey: `sms:${messageSid}`,
    rawPayload: payload,
    messageSid,
  });

  const thread = await prisma.thread.upsert({
    where: {
      businessId_phoneNumberId_externalParticipantE164: {
        businessId: phoneNumber.businessId,
        phoneNumberId: phoneNumber.id,
        externalParticipantE164: from,
      },
    },
    create: {
      businessId: phoneNumber.businessId,
      phoneNumberId: phoneNumber.id,
      externalParticipantE164: from,
      participants: {
        create: [
          { kind: "BUSINESS_NUMBER", phoneNumberId: phoneNumber.id },
          { kind: "EXTERNAL", externalParticipantE164: from },
        ],
      },
    },
    update: {},
  });

  const message = await prisma.message.upsert({
    where: { messageSid },
    create: {
      businessId: phoneNumber.businessId,
      phoneNumberId: phoneNumber.id,
      threadId: thread.id,
      externalParticipantE164: from,
      direction: "INBOUND",
      messageSid,
      body: payload.Body ?? "",
      mediaUrls: [],
      deliveryStatus: MessageDeliveryStatus.DELIVERED,
      providerStatus: payload.SmsStatus ?? "received",
    },
    update: {
      body: payload.Body ?? "",
      providerStatus: payload.SmsStatus ?? "received",
      deliveryStatus: MessageDeliveryStatus.DELIVERED,
    },
  });

  await projectThreadItem({
    businessId: phoneNumber.businessId,
    phoneNumberId: phoneNumber.id,
    externalParticipantE164: from,
    itemType: ThreadItemType.SMS_INBOUND,
    unreadState: UnreadState.UNREAD,
    payloadRefType: "MESSAGE",
    payloadRefId: message.id,
    dedupeKey: `message:${message.id}`,
    occurredAt: message.createdAt,
    previewText: message.body,
  });
}

export async function handleSmsStatus(payload: Record<string, string | undefined>) {
  const messageSid = payload.MessageSid?.trim();
  if (!messageSid) {
    throw new AppError(400, "bad_request", "MessageSid is required");
  }

  const message = await prisma.message.findUnique({
    where: { messageSid },
  });
  if (!message) {
    return;
  }

  await recordProviderEvent({
    businessId: message.businessId,
    eventType: "sms.status",
    dedupeKey: `sms-status:${messageSid}:${payload.MessageStatus ?? payload.SmsStatus ?? "unknown"}`,
    rawPayload: payload,
    messageSid,
  });

  await prisma.message.update({
    where: { id: message.id },
    data: {
      providerStatus: payload.MessageStatus ?? payload.SmsStatus ?? null,
      deliveryStatus:
        payload.MessageStatus === "delivered"
          ? MessageDeliveryStatus.DELIVERED
          : payload.MessageStatus === "failed" || payload.MessageStatus === "undelivered"
            ? MessageDeliveryStatus.FAILED
            : MessageDeliveryStatus.SENT,
      errorCode:
        payload.MessageStatus === "failed" || payload.MessageStatus === "undelivered" ? "SMS_SEND_ERROR" : null,
    },
  });
}

export async function handleVoiceStatus(payload: Record<string, string | undefined>) {
  const normalized = normalizeVoiceStatusPayload(payload);
  const {
    businessId,
    phoneNumberId,
    externalParticipantE164,
    occurredAt,
    rawCallSid,
    sessionCallSid,
    callEventSid,
    parentCallSid,
    childCallSid,
    providerStatus,
    callbackSource,
    direction,
    eventType,
    progressState,
  } = normalized;

  if (!businessId || !phoneNumberId || !externalParticipantE164 || !sessionCallSid || !callEventSid) {
    throw new AppError(400, "bad_request", "Voice status payload is incomplete");
  }

  await recordProviderEvent({
    businessId,
    eventType: "voice.status",
    dedupeKey: `voice-status:${sessionCallSid}:${callEventSid}:${callbackSource ?? "dial-action"}:${providerStatus ?? "unknown"}:${payload.SequenceNumber ?? "0"}`,
    rawPayload: payload,
    callSid: rawCallSid ?? callEventSid,
  });

  const nextState =
    progressState === "active"
      ? "active"
      : progressState === "connecting"
        ? "connecting"
        : eventType === "CALL_COMPLETED"
          ? "ended"
          : eventType
            ? "failed"
            : null;

  if (nextState) {
    const session = await upsertCallSessionTransition({
      businessId,
      state: nextState,
      source: "webhook",
      occurredAt,
      callSid: sessionCallSid,
      phoneNumberId,
      externalParticipantE164,
      direction,
      parentCallSid,
      childCallSid,
      errorCode: eventType && eventType !== "CALL_COMPLETED" ? "CALL_CONNECT_ERROR" : null,
      errorMessage: eventType && eventType !== "CALL_COMPLETED" ? providerStatus : null,
    });
    emitToBusiness(businessId, "call.state", {
      businessId,
      callSid: session.callSid,
      state: fromDbState(session.state),
      externalParticipantE164,
    });
  }

  if (!eventType) {
    return;
  }

  const thread = await prisma.thread.upsert({
    where: {
      businessId_phoneNumberId_externalParticipantE164: {
        businessId,
        phoneNumberId,
        externalParticipantE164,
      },
    },
    create: {
      businessId,
      phoneNumberId,
      externalParticipantE164,
      participants: {
        create: [
          { kind: "BUSINESS_NUMBER", phoneNumberId },
          { kind: "EXTERNAL", externalParticipantE164 },
        ],
      },
    },
    update: {},
  });

  const callEvent = await prisma.callEvent.upsert({
    where: {
      businessId_callSid_eventType: {
        businessId,
        callSid: callEventSid,
        eventType,
      },
    },
    create: {
      businessId,
      phoneNumberId,
      threadId: thread.id,
      externalParticipantE164,
      eventType,
      direction: (direction === "outbound" ? "OUTBOUND" : "INBOUND") as "INBOUND" | "OUTBOUND",
      callSid: callEventSid,
      parentCallSid,
      childCallSid,
      providerStatus,
      startedAt: occurredAt,
      endedAt: occurredAt,
      durationSeconds: payload.CallDuration ? Number(payload.CallDuration) : null,
    },
    update: {
      providerStatus,
      parentCallSid,
      childCallSid,
      endedAt: occurredAt,
      durationSeconds: payload.CallDuration ? Number(payload.CallDuration) : null,
    },
  });

  await projectThreadItem({
    businessId,
    phoneNumberId,
    externalParticipantE164,
    itemType: eventType,
    unreadState: eventType === "CALL_COMPLETED" ? UnreadState.READ : UnreadState.UNREAD,
    payloadRefType: "CALL_EVENT",
    payloadRefId: callEvent.id,
    dedupeKey: `call-event:${callEvent.id}`,
    occurredAt: callEvent.endedAt ?? callEvent.createdAt,
    previewText:
      eventType === "MISSED_CALL"
        ? "Missed call"
        : eventType === "CALL_DECLINED"
          ? "Call declined"
          : "Call completed",
  });
}

export async function handleVoiceRecording(payload: Record<string, string | undefined>) {
  const businessId = payload.businessId ?? payload.BusinessId;
  const phoneNumberId = payload.phoneNumberId ?? payload.PhoneNumberId;
  const externalParticipantE164 = optionalE164(payload.externalParticipantE164 ?? payload.ExternalParticipantE164 ?? payload.From ?? payload.To);
  const recordingSid = payload.RecordingSid?.trim() ?? null;
  const callSid = payload.callSid?.trim() ?? payload.CallSid?.trim() ?? null;
  const recordingUrl = payload.RecordingUrl?.trim();

  if (!businessId || !phoneNumberId || !externalParticipantE164 || !callSid || !recordingUrl) {
    throw new AppError(400, "bad_request", "Voice recording payload is incomplete");
  }

  await recordProviderEvent({
    businessId,
    eventType: "voice.recording",
    dedupeKey: `voice-recording:${recordingSid ?? callSid}`,
    rawPayload: payload,
    callSid,
    recordingSid,
  });

  const thread = await prisma.thread.upsert({
    where: {
      businessId_phoneNumberId_externalParticipantE164: {
        businessId,
        phoneNumberId,
        externalParticipantE164,
      },
    },
    create: {
      businessId,
      phoneNumberId,
      externalParticipantE164,
      participants: {
        create: [
          { kind: "BUSINESS_NUMBER", phoneNumberId },
          { kind: "EXTERNAL", externalParticipantE164 },
        ],
      },
    },
    update: {},
  });

  const voicemail = await prisma.voicemail.upsert({
    where: {
      businessId_callSid: {
        businessId,
        callSid,
      },
    },
    create: {
      businessId,
      phoneNumberId,
      threadId: thread.id,
      externalParticipantE164,
      callSid,
      recordingSid,
      recordingUrl: `${recordingUrl}.mp3`,
      durationSeconds: payload.RecordingDuration ? Number(payload.RecordingDuration) : null,
      transcriptStatus: payload.TranscriptionText ? VoicemailTranscriptionStatus.COMPLETED : VoicemailTranscriptionStatus.PENDING,
      transcriptText: payload.TranscriptionText ?? null,
    },
    update: {
      recordingSid,
      recordingUrl: `${recordingUrl}.mp3`,
      durationSeconds: payload.RecordingDuration ? Number(payload.RecordingDuration) : null,
      transcriptStatus: payload.TranscriptionText ? VoicemailTranscriptionStatus.COMPLETED : VoicemailTranscriptionStatus.PENDING,
      transcriptText: payload.TranscriptionText ?? null,
    },
  });

  await projectThreadItem({
    businessId,
    phoneNumberId,
    externalParticipantE164,
    itemType: ThreadItemType.VOICEMAIL,
    unreadState: UnreadState.UNREAD,
    payloadRefType: "VOICEMAIL",
    payloadRefId: voicemail.id,
    dedupeKey: `voicemail:${voicemail.id}`,
    occurredAt: voicemail.createdAt,
    previewText: voicemail.transcriptText?.slice(0, 80) ?? "New voicemail",
  });
}

export async function handleVoiceTranscription(payload: Record<string, string | undefined>) {
  const businessId = payload.businessId ?? payload.BusinessId;
  const transcriptionProviderId = payload.TranscriptionSid?.trim() ?? null;
  const callSid = payload.callSid?.trim() ?? payload.CallSid?.trim() ?? null;
  const recordingSid = payload.RecordingSid?.trim() ?? null;

  if (!businessId || !callSid) {
    throw new AppError(400, "bad_request", "Voice transcription payload is incomplete");
  }

  await recordProviderEvent({
    businessId,
    eventType: "voice.transcription",
    dedupeKey: `voice-transcription:${transcriptionProviderId ?? callSid}`,
    rawPayload: payload,
    callSid,
    recordingSid,
    transcriptionProviderId,
  });

  const voicemail = await prisma.voicemail.findFirst({
    where: {
      businessId,
      OR: [
        { callSid },
        ...(recordingSid ? [{ recordingSid }] : []),
        ...(transcriptionProviderId ? [{ transcriptionProviderId }] : []),
      ],
    },
  });

  if (!voicemail) {
    return;
  }

  const transcriptText = payload.TranscriptionText?.trim() ?? null;
  const transcriptStatus = transcriptText ? VoicemailTranscriptionStatus.COMPLETED : VoicemailTranscriptionStatus.FAILED;

  const updated = await prisma.voicemail.update({
    where: { id: voicemail.id },
    data: {
      transcriptText,
      transcriptStatus,
      transcriptionProviderId,
    },
  });

  await prisma.threadItem.updateMany({
    where: {
      businessId,
      payloadRefType: "VOICEMAIL",
      payloadRefId: voicemail.id,
    },
    data: {
      previewText: transcriptText?.slice(0, 80) ?? "New voicemail",
    },
  });

  await syncNotificationStateForBusiness(businessId);
  return updated;
}
