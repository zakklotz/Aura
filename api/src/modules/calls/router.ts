import { Router } from "express";
import { z } from "zod";
import { NormalizedErrorCode } from "@prisma/client";
import { requireBusiness, requireUser } from "../../middleware/auth.js";
import { sendAppError, AppError } from "../../lib/errors.js";
import { createVoiceAccessToken, ensureTwilioVoiceConfigured, summarizeVoiceAccessToken } from "../../lib/twilio.js";
import { env } from "../../lib/env.js";
import { normalizeToE164 } from "../../lib/phone.js";
import { getPrimaryPhoneNumberForBusiness } from "../phoneNumbers/service.js";
import { emitToBusiness } from "../../lib/socket.js";
import { upsertCallSessionTransition, fromDbState } from "./sessionService.js";

export const callsRouter = Router();

const VOICE_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const VOICE_ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 5 * 60;

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return { message: String(error) };
}

callsRouter.get("/access-token", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    ensureTwilioVoiceConfigured();
    const identity = `business_${viewer.businessId}_user_${viewer.userId}`;
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + VOICE_ACCESS_TOKEN_TTL_SECONDS * 1000);
    const refreshAfter = new Date(expiresAt.getTime() - VOICE_ACCESS_TOKEN_REFRESH_SKEW_SECONDS * 1000);
    const token = createVoiceAccessToken(identity);
    const tokenClaims = summarizeVoiceAccessToken(token);
    console.info("[voice/access-token] Minted access token", {
      businessId: viewer.businessId,
      userId: viewer.userId,
      identity,
      hasStableIdentity: Boolean(viewer.businessId && viewer.userId && identity),
      configuredTwimlAppSid: env.twilioTwimlAppSid || null,
      tokenClaims,
      outgoingApplicationSidMatchesConfig: tokenClaims?.outgoingApplicationSid === (env.twilioTwimlAppSid || null),
      viewerVoiceRegistrationState: viewer.voiceRegistrationState,
      ttlSeconds: VOICE_ACCESS_TOKEN_TTL_SECONDS,
      refreshSkewSeconds: VOICE_ACCESS_TOKEN_REFRESH_SKEW_SECONDS,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      refreshAfter: refreshAfter.toISOString(),
    });
    res.json({
      token,
      identity,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      refreshAfter: refreshAfter.toISOString(),
      voiceRegistrationState: viewer.voiceRegistrationState,
    });
  } catch (error) {
    sendAppError(
      res,
      error instanceof Error
        ? new AppError(503, "VOICE_TOKEN_ERROR", error.message)
        : error
    );
    console.error("[voice/access-token] Failed to mint access token", {
      viewerBusinessId: req.viewer?.businessId ?? null,
      viewerUserId: req.viewer?.userId ?? null,
      error: summarizeError(error),
    });
  }
});

const outboundSchema = z.object({
  to: z.string().min(1),
  phoneNumberId: z.string().optional(),
});

callsRouter.post("/outbound", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const input = outboundSchema.parse(req.body);
    console.info("[voice/outbound] Received outbound session request", {
      businessId: viewer.businessId,
      userId: viewer.userId,
      requestedTo: input.to,
      requestedPhoneNumberId: input.phoneNumberId ?? null,
      deviceId: viewer.currentDeviceId ?? null,
    });
    const phoneNumber =
      input.phoneNumberId != null ? { id: input.phoneNumberId } : await getPrimaryPhoneNumberForBusiness(viewer.businessId!);
    if (!phoneNumber) {
      throw new AppError(400, "bad_request", "No business phone number is configured");
    }
    const externalParticipantE164 = normalizeToE164(input.to);
    const session = await upsertCallSessionTransition({
      businessId: viewer.businessId!,
      state: "outgoing_dialing",
      source: "api",
      occurredAt: new Date(),
      callSid: null,
      phoneNumberId: phoneNumber.id,
      externalParticipantE164,
      direction: "outbound",
      lastActorUserId: viewer.userId,
      lastActorDeviceId: viewer.currentDeviceId,
    });
    emitToBusiness(viewer.businessId!, "call.state", {
      businessId: viewer.businessId!,
      callSid: session.callSid,
      state: fromDbState(session.state),
      externalParticipantE164,
    });
    console.info("[voice/outbound] Created outbound session", {
      sessionId: session.id,
      businessId: viewer.businessId,
      phoneNumberId: phoneNumber.id,
      externalParticipantE164,
      deviceId: viewer.currentDeviceId ?? null,
    });
    res.status(202).json({
      ok: true,
      sessionId: session.id,
      externalParticipantE164,
      phoneNumberId: phoneNumber.id,
    });
  } catch (error) {
    console.error("[voice/outbound] Failed to create outbound session", {
      viewerBusinessId: req.viewer?.businessId ?? null,
      viewerUserId: req.viewer?.userId ?? null,
      body: req.body,
      error: summarizeError(error),
    });
    sendAppError(res, error);
  }
});

const callSessionEventSchema = z.object({
  state: z.enum(["incoming", "answering", "outgoing_dialing", "connecting", "active", "ended", "failed"]),
  occurredAt: z.string().datetime(),
  callSid: z.string().trim().optional().nullable(),
  parentCallSid: z.string().trim().optional().nullable(),
  childCallSid: z.string().trim().optional().nullable(),
  direction: z.enum(["inbound", "outbound"]).optional().nullable(),
  phoneNumberId: z.string().trim().optional().nullable(),
  externalParticipantE164: z.string().trim().optional().nullable(),
  errorCode: z.nativeEnum(NormalizedErrorCode).optional().nullable(),
  errorMessage: z.string().trim().optional().nullable(),
});

callsRouter.post("/call-session/events", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const input = callSessionEventSchema.parse(req.body);
    const session = await upsertCallSessionTransition({
      businessId: viewer.businessId!,
      state: input.state,
      source: "sdk",
      occurredAt: new Date(input.occurredAt),
      callSid: input.callSid ?? null,
      parentCallSid: input.parentCallSid ?? null,
      childCallSid: input.childCallSid ?? null,
      direction: input.direction ?? null,
      phoneNumberId: input.phoneNumberId ?? null,
      externalParticipantE164: input.externalParticipantE164 ?? null,
      lastActorUserId: viewer.userId,
      lastActorDeviceId: viewer.currentDeviceId,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    });
    emitToBusiness(viewer.businessId!, "call.state", {
      businessId: viewer.businessId!,
      callSid: session.callSid,
      state: fromDbState(session.state),
      externalParticipantE164: session.externalParticipantE164,
    });
    res.status(202).json({
      session: {
        id: session.id,
        state: fromDbState(session.state),
        callSid: session.callSid,
        externalParticipantE164: session.externalParticipantE164,
      },
    });
  } catch (error) {
    sendAppError(res, error);
  }
});
