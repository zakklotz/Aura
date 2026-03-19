import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireBusiness, requireUser } from "../../middleware/auth.js";
import { sendAppError, AppError } from "../../lib/errors.js";
import { syncNotificationStateForBusiness } from "../threads/service.js";

export const devicesRouter = Router();

const registerSchema = z.object({
  deviceId: z.string().trim().min(1),
  platform: z.enum(["IOS", "ANDROID"]),
  appBuild: z.string().trim().optional(),
  appRuntimeVersion: z.string().trim().optional(),
  expoPushToken: z.string().trim().optional(),
  voicePushToken: z.string().trim().optional(),
  twilioIdentity: z.string().trim().optional(),
  voiceRegistrationState: z.enum(["READY", "DEGRADED", "REGISTERING"]),
  lastRegistrationErrorCode: z.enum([
    "VOICE_TOKEN_ERROR",
    "VOICE_REGISTRATION_ERROR",
    "CALL_CONNECT_ERROR",
    "SMS_SEND_ERROR",
    "RECORDING_ERROR",
    "TRANSCRIPTION_ERROR",
  ]).optional(),
  lastRegistrationErrorMessage: z.string().trim().optional(),
});

devicesRouter.post("/register", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const input = registerSchema.parse(req.body);
    const resolvedErrorCode = input.voiceRegistrationState === "READY" ? null : (input.lastRegistrationErrorCode ?? null);
    const resolvedErrorMessage = input.voiceRegistrationState === "READY" ? null : (input.lastRegistrationErrorMessage ?? null);
    const registration = await prisma.deviceRegistration.upsert({
      where: {
        businessId_userId_deviceId: {
          businessId: viewer.businessId!,
          userId: viewer.userId,
          deviceId: input.deviceId,
        },
      },
      create: {
        businessId: viewer.businessId!,
        userId: viewer.userId,
        deviceId: input.deviceId,
        platform: input.platform,
        appBuild: input.appBuild,
        appRuntimeVersion: input.appRuntimeVersion,
        expoPushToken: input.expoPushToken,
        voicePushToken: input.voicePushToken,
        twilioIdentity: input.twilioIdentity,
        voiceRegistrationState: input.voiceRegistrationState,
        lastRegisteredAt: new Date(),
        lastRegistrationErrorCode: resolvedErrorCode,
        lastRegistrationErrorMessage: resolvedErrorMessage,
      },
      update: {
        platform: input.platform,
        appBuild: input.appBuild,
        appRuntimeVersion: input.appRuntimeVersion,
        expoPushToken: input.expoPushToken,
        voicePushToken: input.voicePushToken,
        twilioIdentity: input.twilioIdentity,
        voiceRegistrationState: input.voiceRegistrationState,
        lastRegisteredAt: new Date(),
        lastRegistrationErrorCode: resolvedErrorCode,
        lastRegistrationErrorMessage: resolvedErrorMessage,
      },
    });

    await syncNotificationStateForBusiness(viewer.businessId!);
    res.status(201).json({ registration });
  } catch (error) {
    sendAppError(res, error);
  }
});

const unregisterSchema = z.object({
  deviceId: z.string().trim().min(1),
});

devicesRouter.post("/unregister", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const input = unregisterSchema.parse(req.body);
    await prisma.deviceRegistration.deleteMany({
      where: {
        businessId: viewer.businessId!,
        userId: viewer.userId,
        deviceId: input.deviceId,
      },
    });
    await syncNotificationStateForBusiness(viewer.businessId!);
    res.json({ ok: true });
  } catch (error) {
    sendAppError(res, error);
  }
});
