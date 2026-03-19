import twilio from "twilio";
import { MessageDeliveryStatus, ThreadItemType, UnreadState, VoicemailTranscriptionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { normalizeToE164, optionalE164 } from "../../lib/phone.js";
import { projectThreadItem, syncNotificationStateForBusiness } from "../threads/service.js";
import { resolveBusinessPhoneNumberByE164 } from "../phoneNumbers/service.js";
import { requireApiBaseUrl } from "../../lib/env.js";
import { emitToBusiness } from "../../lib/socket.js";
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

  const dial = response.dial({
    callerId: input.callerId,
    answerOnBridge: true,
    action: actionUrl.toString(),
    method: "POST",
  });
  dial.number(input.to);
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
  const businessId = payload.businessId ?? payload.BusinessId;
  const phoneNumberId = payload.phoneNumberId ?? payload.PhoneNumberId;
  const externalParticipantE164 = optionalE164(payload.externalParticipantE164 ?? payload.ExternalParticipantE164 ?? payload.From ?? payload.To);
  const callSid = payload.CallSid?.trim() ?? payload.callSid?.trim() ?? null;

  if (!businessId || !phoneNumberId || !externalParticipantE164 || !callSid) {
    throw new AppError(400, "bad_request", "Voice status payload is incomplete");
  }

  const dialCallStatus = payload.DialCallStatus?.trim().toLowerCase();
  const callStatus = (payload.CallStatus ?? payload.DialCallStatus ?? "").trim().toLowerCase();
  const eventType =
    dialCallStatus === "busy" || dialCallStatus === "no-answer" || dialCallStatus === "failed" || callStatus === "busy"
      ? "MISSED_CALL"
      : dialCallStatus === "canceled"
        ? "CALL_DECLINED"
        : callStatus === "completed" || dialCallStatus === "completed"
          ? "CALL_COMPLETED"
          : null;

  await recordProviderEvent({
    businessId,
    eventType: "voice.status",
    dedupeKey: `voice-status:${callSid}:${dialCallStatus ?? callStatus}`,
    rawPayload: payload,
    callSid,
  });

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
        callSid,
        eventType,
      },
    },
    create: {
      businessId,
      phoneNumberId,
      threadId: thread.id,
      externalParticipantE164,
      eventType,
      direction: (payload.Direction?.toLowerCase().includes("outbound") ? "OUTBOUND" : "INBOUND") as "INBOUND" | "OUTBOUND",
      callSid,
      parentCallSid: payload.ParentCallSid ?? null,
      childCallSid: payload.ChildCallSid ?? null,
      providerStatus: payload.CallStatus ?? payload.DialCallStatus ?? null,
      startedAt: payload.Timestamp ? new Date(payload.Timestamp) : null,
      endedAt: new Date(),
      durationSeconds: payload.CallDuration ? Number(payload.CallDuration) : null,
    },
    update: {
      providerStatus: payload.CallStatus ?? payload.DialCallStatus ?? null,
      endedAt: new Date(),
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

  const session = await upsertCallSessionTransition({
    businessId,
    state: eventType === "CALL_COMPLETED" ? "ended" : "failed",
    source: "webhook",
    occurredAt: new Date(),
    callSid,
    phoneNumberId,
    externalParticipantE164,
    direction: payload.Direction?.toLowerCase().includes("outbound") ? "outbound" : "inbound",
    parentCallSid: payload.ParentCallSid ?? null,
    childCallSid: payload.ChildCallSid ?? null,
    errorCode: eventType === "CALL_COMPLETED" ? null : "CALL_CONNECT_ERROR",
    errorMessage: eventType === "CALL_COMPLETED" ? null : payload.CallStatus ?? payload.DialCallStatus ?? null,
  });
  emitToBusiness(businessId, "call.state", {
    businessId,
    callSid: session.callSid,
    state: fromDbState(session.state),
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
