import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { sendAppError, AppError } from "../../lib/errors.js";
import { validateTwilioSignature } from "../../lib/twilio.js";
import { env, requireApiBaseUrl } from "../../lib/env.js";
import {
  buildIncomingVoiceResponse,
  buildOutboundVoiceResponse,
  buildVoicemailFallbackResponse,
  handleInboundSms,
  handleSmsStatus,
  handleVoiceRecording,
  handleVoiceStatus,
  handleVoiceTranscription,
  parseIdentity,
  recordProviderEvent,
  resolveBusinessPhoneByIncomingNumber,
} from "./service.js";
import { optionalE164 } from "../../lib/phone.js";
import { getPrimaryPhoneNumberForBusiness } from "../phoneNumbers/service.js";
import { emitToBusiness } from "../../lib/socket.js";
import { fromDbState, upsertCallSessionTransition } from "../calls/sessionService.js";

export const twilioRouter = Router();

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return { message: String(error) };
}

function summarizeTwilioPayload(payload: Record<string, string | undefined>) {
  return {
    AccountSid: payload.AccountSid ?? null,
    ApiVersion: payload.ApiVersion ?? null,
    From: payload.From ?? null,
    To: payload.To ?? null,
    Identity: payload.Identity ?? null,
    CallSid: payload.CallSid ?? payload.callSid ?? null,
    DialCallSid: payload.DialCallSid ?? null,
    ParentCallSid: payload.ParentCallSid ?? null,
    CallStatus: payload.CallStatus ?? null,
    DialCallStatus: payload.DialCallStatus ?? null,
    Direction: payload.Direction ?? null,
    CallbackSource: payload.CallbackSource ?? null,
    SequenceNumber: payload.SequenceNumber ?? null,
    businessId: payload.businessId ?? payload.BusinessId ?? null,
    phoneNumberId: payload.phoneNumberId ?? payload.PhoneNumberId ?? null,
    externalParticipantE164: payload.externalParticipantE164 ?? payload.ExternalParticipantE164 ?? null,
  };
}

function firstHeaderValue(value: string | undefined): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

function getTwilioRequestId(res: Response): string {
  if (typeof res.locals.twilioRequestId !== "string") {
    res.locals.twilioRequestId = randomUUID();
  }
  return res.locals.twilioRequestId;
}

function getTwilioValidationUrls(req: Request): string[] {
  const forwardedProto = firstHeaderValue(req.header("x-forwarded-proto")) ?? req.protocol;
  const forwardedHost = firstHeaderValue(req.header("x-forwarded-host")) ?? req.get("host") ?? undefined;
  const forwardedPort = firstHeaderValue(req.header("x-forwarded-port"));
  const normalizedHost =
    forwardedHost && forwardedPort && !forwardedHost.includes(":") && !["80", "443"].includes(forwardedPort)
      ? `${forwardedHost}:${forwardedPort}`
      : forwardedHost;

  const urls = new Set<string>();
  if (normalizedHost) {
    urls.add(`${forwardedProto}://${normalizedHost}${req.originalUrl}`);
  }
  urls.add(new URL(req.originalUrl, `${requireApiBaseUrl()}/`).toString());
  return [...urls];
}

twilioRouter.use((req, res, next) => {
  const requestId = getTwilioRequestId(res);
  const signature = req.header("x-twilio-signature") ?? undefined;
  const payload = req.method === "GET" ? (req.query as Record<string, string | undefined>) : (req.body as Record<string, string | undefined>);
  const validationUrls = getTwilioValidationUrls(req);
  const matchedValidationUrl =
    process.env.NODE_ENV === "test" || !env.twilioWebhookAuthToken
      ? null
      : (validationUrls.find((url) => validateTwilioSignature(url, signature, payload)) ?? null);

  if (req.path.startsWith("/voice")) {
    console.info("[twilio/webhook] Received voice webhook", {
      requestId,
      path: req.path,
      method: req.method,
      hasSignature: Boolean(signature),
      host: req.get("host") ?? null,
      forwardedHost: firstHeaderValue(req.header("x-forwarded-host")) ?? null,
      forwardedProto: firstHeaderValue(req.header("x-forwarded-proto")) ?? null,
      candidateValidationUrls: validationUrls,
      payload: summarizeTwilioPayload(payload),
    });
  }

  if (process.env.NODE_ENV === "test" || !env.twilioWebhookAuthToken) {
    next();
    return;
  }

  if (!matchedValidationUrl) {
    if (req.path.startsWith("/voice")) {
      console.warn("[twilio/webhook] Signature validation failed", {
        requestId,
        path: req.path,
        method: req.method,
        hasSignature: Boolean(signature),
        candidateValidationUrls: validationUrls,
        payload: summarizeTwilioPayload(payload),
      });
    }
    next(new AppError(403, "forbidden", "Twilio signature validation failed"));
    return;
  }

  if (req.path.startsWith("/voice")) {
    console.info("[twilio/webhook] Signature validation passed", {
      requestId,
      path: req.path,
      matchedValidationUrl,
      candidateValidationUrls: validationUrls,
    });
  }

  next();
});

twilioRouter.post("/sms/inbound", async (req, res) => {
  try {
    await handleInboundSms(req.body as Record<string, string | undefined>);
    res.type("text/xml").send("<Response></Response>");
  } catch (error) {
    sendAppError(res, error);
  }
});

twilioRouter.post("/sms/status", async (req, res) => {
  try {
    await handleSmsStatus(req.body as Record<string, string | undefined>);
    res.json({ ok: true });
  } catch (error) {
    sendAppError(res, error);
  }
});

twilioRouter.post("/voice/incoming", async (req, res) => {
  try {
    const payload = req.body as Record<string, string | undefined>;
    const from = optionalE164(payload.From);
    const phoneNumber = await resolveBusinessPhoneByIncomingNumber(payload.To);
    if (!phoneNumber || !from) {
      throw new AppError(404, "not_found", "Incoming business phone number was not found");
    }

    const memberships = await prisma.businessMembership.findMany({
      where: { businessId: phoneNumber.businessId },
    });
    const identities = memberships.map((membership) => `business_${membership.businessId}_user_${membership.userId}`);

    const session = await upsertCallSessionTransition({
      businessId: phoneNumber.businessId,
      state: "incoming",
      source: "webhook",
      occurredAt: new Date(),
      callSid: payload.CallSid ?? null,
      phoneNumberId: phoneNumber.id,
      externalParticipantE164: from,
      direction: "inbound",
    });
    emitToBusiness(phoneNumber.businessId, "call.state", {
      businessId: phoneNumber.businessId,
      callSid: session.callSid,
      state: fromDbState(session.state),
      externalParticipantE164: from,
    });

    const response = buildIncomingVoiceResponse({
      businessId: phoneNumber.businessId,
      phoneNumberId: phoneNumber.id,
      externalParticipantE164: from,
      identities,
    });
    res.type("text/xml").send(response.toString());
  } catch (error) {
    sendAppError(res, error);
  }
});

twilioRouter.post("/voice/outbound", async (req, res) => {
  const requestId = getTwilioRequestId(res);
  try {
    const payload = req.body as Record<string, string | undefined>;
    const to = optionalE164(payload.To);
    const identity = parseIdentity(payload.From?.replace(/^client:/i, "") ?? payload.Identity);
    console.info("[twilio/voice/outbound] Processing outbound TwiML request", {
      requestId,
      payload: summarizeTwilioPayload(payload),
      normalizedTo: to,
      parsedIdentity: identity,
    });
    if (!to || !identity) {
      throw new AppError(400, "bad_request", "Outbound voice payload is incomplete");
    }

    const phoneNumber = await getPrimaryPhoneNumberForBusiness(identity.businessId);
    if (!phoneNumber) {
      throw new AppError(404, "not_found", "No primary business number configured");
    }

    const response = buildOutboundVoiceResponse({
      to,
      callerId: phoneNumber.e164,
      businessId: identity.businessId,
      phoneNumberId: phoneNumber.id,
      externalParticipantE164: to,
    });
    console.info("[twilio/voice/outbound] Returning outbound TwiML", {
      requestId,
      businessId: identity.businessId,
      destination: to,
      callerId: phoneNumber.e164,
      xml: response.toString(),
    });
    res.type("text/xml").send(response.toString());
  } catch (error) {
    console.error("[twilio/voice/outbound] Failed to build outbound TwiML", {
      requestId,
      payload: summarizeTwilioPayload(req.body as Record<string, string | undefined>),
      error: summarizeError(error),
    });
    sendAppError(res, error);
  }
});

twilioRouter.post("/voice/status", async (req, res) => {
  const requestId = getTwilioRequestId(res);
  try {
    const payload = {
      ...(req.query as Record<string, string | undefined>),
      ...(req.body as Record<string, string | undefined>),
    };
    console.info("[twilio/voice/status] Processing voice status webhook", {
      requestId,
      payload: summarizeTwilioPayload(payload),
    });

    if (payload.DialCallStatus && payload.DialCallStatus !== "completed" && payload.businessId && payload.phoneNumberId && payload.externalParticipantE164) {
      await handleVoiceStatus(payload);
      const response = await buildVoicemailFallbackResponse({
        businessId: payload.businessId,
        phoneNumberId: payload.phoneNumberId,
        externalParticipantE164: payload.externalParticipantE164,
        callSid: payload.CallSid,
      });
      console.info("[twilio/voice/status] Returning voicemail fallback TwiML", {
        requestId,
        payload: summarizeTwilioPayload(payload),
        xml: response.toString(),
      });
      res.type("text/xml").send(response.toString());
      return;
    }

    await handleVoiceStatus(payload);
    res.type("text/xml").send("<Response></Response>");
  } catch (error) {
    console.error("[twilio/voice/status] Failed to process voice status webhook", {
      requestId,
      payload: summarizeTwilioPayload({
        ...(req.query as Record<string, string | undefined>),
        ...(req.body as Record<string, string | undefined>),
      }),
      error: summarizeError(error),
    });
    sendAppError(res, error);
  }
});

twilioRouter.post("/voice/recording", async (req, res) => {
  try {
    await handleVoiceRecording({
      ...(req.query as Record<string, string | undefined>),
      ...(req.body as Record<string, string | undefined>),
    });
    res.json({ ok: true });
  } catch (error) {
    sendAppError(res, error);
  }
});

twilioRouter.post("/voice/transcription", async (req, res) => {
  try {
    await handleVoiceTranscription({
      ...(req.query as Record<string, string | undefined>),
      ...(req.body as Record<string, string | undefined>),
    });
    res.json({ ok: true });
  } catch (error) {
    sendAppError(res, error);
  }
});
