import { Router } from "express";
import { requireBusiness, requireUser } from "../../middleware/auth.js";
import { sendAppError } from "../../lib/errors.js";
import { getPreferredCallSession, fromDbState } from "./sessionService.js";

export const callSessionRouter = Router();

callSessionRouter.get("/", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const session = await getPreferredCallSession({
      businessId: viewer.businessId!,
      deviceId: viewer.currentDeviceId,
    });
    res.json({
      session: session
        ? {
            id: session.id,
            state: fromDbState(session.state),
            callSid: session.callSid,
            phoneNumberId: session.phoneNumberId,
            externalParticipantE164: session.externalParticipantE164,
            direction: session.direction?.toLowerCase() ?? null,
            updatedAt: session.updatedAt.toISOString(),
            occurredAt: session.lastTransitionAt.toISOString(),
            errorCode: session.errorCode,
            errorMessage: session.errorMessage,
          }
        : {
            id: null,
            state: "idle",
            callSid: null,
            phoneNumberId: null,
            externalParticipantE164: null,
            direction: null,
            updatedAt: new Date().toISOString(),
            occurredAt: null,
            errorCode: null,
            errorMessage: null,
          },
      device: {
        deviceId: viewer.currentDeviceId,
        twilioIdentity: viewer.currentDeviceRegistration?.twilioIdentity ?? null,
        voiceRegistrationState: viewer.voiceRegistrationState.toLowerCase(),
        lastRegisteredAt: viewer.currentDeviceRegistration?.lastRegisteredAt?.toISOString() ?? null,
        lastRegistrationErrorCode: viewer.currentDeviceRegistration?.lastRegistrationErrorCode ?? null,
        lastRegistrationErrorMessage: viewer.currentDeviceRegistration?.lastRegistrationErrorMessage ?? null,
      },
    });
  } catch (error) {
    sendAppError(res, error);
  }
});
