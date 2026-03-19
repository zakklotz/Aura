import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { sendAppError, AppError } from "../../lib/errors.js";
import { validateTwilioSignature } from "../../lib/twilio.js";
import { buildIncomingVoiceResponse, buildOutboundVoiceResponse, buildVoicemailFallbackResponse, handleInboundSms, handleSmsStatus, handleVoiceRecording, handleVoiceStatus, handleVoiceTranscription, parseIdentity, resolveBusinessPhoneByIncomingNumber, } from "./service.js";
import { optionalE164 } from "../../lib/phone.js";
import { getPrimaryPhoneNumberForBusiness } from "../phoneNumbers/service.js";
import { emitToBusiness } from "../../lib/socket.js";
import { fromDbState, upsertCallSessionTransition } from "../calls/sessionService.js";
export const twilioRouter = Router();
twilioRouter.use((req, _res, next) => {
    const signature = req.header("x-twilio-signature") ?? undefined;
    const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const payload = req.method === "GET" ? req.query : req.body;
    if (process.env.NODE_ENV === "test" || !process.env.TWILIO_WEBHOOK_AUTH_TOKEN) {
        next();
        return;
    }
    if (!validateTwilioSignature(url, signature, payload)) {
        next(new AppError(403, "forbidden", "Twilio signature validation failed"));
        return;
    }
    next();
});
twilioRouter.post("/sms/inbound", async (req, res) => {
    try {
        await handleInboundSms(req.body);
        res.type("text/xml").send("<Response></Response>");
    }
    catch (error) {
        sendAppError(res, error);
    }
});
twilioRouter.post("/sms/status", async (req, res) => {
    try {
        await handleSmsStatus(req.body);
        res.json({ ok: true });
    }
    catch (error) {
        sendAppError(res, error);
    }
});
twilioRouter.post("/voice/incoming", async (req, res) => {
    try {
        const payload = req.body;
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
    }
    catch (error) {
        sendAppError(res, error);
    }
});
twilioRouter.post("/voice/outbound", async (req, res) => {
    try {
        const payload = req.body;
        const to = optionalE164(payload.To);
        const identity = parseIdentity(payload.From?.replace(/^client:/i, "") ?? payload.Identity);
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
        res.type("text/xml").send(response.toString());
    }
    catch (error) {
        sendAppError(res, error);
    }
});
twilioRouter.post("/voice/status", async (req, res) => {
    try {
        const payload = {
            ...req.query,
            ...req.body,
        };
        if (payload.DialCallStatus && payload.DialCallStatus !== "completed" && payload.businessId && payload.phoneNumberId && payload.externalParticipantE164) {
            const response = await buildVoicemailFallbackResponse({
                businessId: payload.businessId,
                phoneNumberId: payload.phoneNumberId,
                externalParticipantE164: payload.externalParticipantE164,
                callSid: payload.CallSid,
            });
            res.type("text/xml").send(response.toString());
            return;
        }
        await handleVoiceStatus(payload);
        res.type("text/xml").send("<Response></Response>");
    }
    catch (error) {
        sendAppError(res, error);
    }
});
twilioRouter.post("/voice/recording", async (req, res) => {
    try {
        await handleVoiceRecording({
            ...req.query,
            ...req.body,
        });
        res.json({ ok: true });
    }
    catch (error) {
        sendAppError(res, error);
    }
});
twilioRouter.post("/voice/transcription", async (req, res) => {
    try {
        await handleVoiceTranscription({
            ...req.query,
            ...req.body,
        });
        res.json({ ok: true });
    }
    catch (error) {
        sendAppError(res, error);
    }
});
