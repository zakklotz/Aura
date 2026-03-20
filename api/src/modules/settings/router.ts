import fs from "node:fs";
import multer from "multer";
import { Router } from "express";
import { z } from "zod";
import { IdempotencyOperation } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { uploadsDirectory, uploadGreetingFile } from "../../lib/mediaStorage.js";
import { requireBusiness, requireUser } from "../../middleware/auth.js";
import { sendAppError, AppError } from "../../lib/errors.js";
import { claimIdempotency, resolveIdempotency } from "../../lib/idempotency.js";
import { hashRequestBody } from "../../lib/hash.js";
import { syncBusinessOnboardingState } from "../businesses/service.js";
import { getPrimaryPhoneNumberForBusiness } from "../phoneNumbers/service.js";
import { hasTwilioVoiceConfig } from "../../lib/env.js";
import { getHistorySyncStatus } from "../historySync/service.js";

export const settingsRouter = Router();

if (!fs.existsSync(uploadsDirectory())) {
  fs.mkdirSync(uploadsDirectory(), { recursive: true });
}

const upload = multer({
  dest: uploadsDirectory(),
});

settingsRouter.get("/communication", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: viewer.businessId! },
    });
    const primaryPhoneNumber = await getPrimaryPhoneNumberForBusiness(viewer.businessId!);
    const onboardingState = await syncBusinessOnboardingState(viewer.businessId!);
    const historySyncStatus = await getHistorySyncStatus(viewer.businessId!);
    const greetings = primaryPhoneNumber
      ? await prisma.voicemailGreeting.findMany({
          where: { phoneNumberId: primaryPhoneNumber.id },
          orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        })
      : [];

    res.json({
      business: {
        id: business.id,
        displayName: business.displayName,
        onboardingState,
      },
      voiceRegistrationState: viewer.voiceRegistrationState,
      playbackDefaultsToSpeaker: true,
      primaryPhoneNumber,
      greetings,
      featureReadiness: {
        voiceConfigured: hasTwilioVoiceConfig(),
        voiceUnavailableReason: primaryPhoneNumber
          ? hasTwilioVoiceConfig()
            ? null
            : "Server Twilio voice configuration is incomplete."
          : "Add a business phone number before calling can work.",
        historySyncAvailable: historySyncStatus.isSyncAvailable,
        historySyncUnavailableReason: historySyncStatus.unavailableReason,
        hasPrimaryPhoneNumber: Boolean(primaryPhoneNumber),
        missingSetupStep:
          onboardingState === "NEEDS_BUSINESS_PROFILE"
            ? "BUSINESS_PROFILE"
            : onboardingState === "NEEDS_PHONE_NUMBER"
              ? "PHONE_NUMBER"
              : onboardingState === "NEEDS_GREETING"
                ? "GREETING"
                : null,
      },
    });
  } catch (error) {
    sendAppError(res, error);
  }
});

const updateCommunicationSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
});

settingsRouter.patch("/communication", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const input = updateCommunicationSchema.parse(req.body);
    const business = await prisma.business.update({
      where: { id: viewer.businessId! },
      data: {
        displayName: input.displayName,
      },
    });
    const onboardingState = await syncBusinessOnboardingState(business.id);
    res.json({
      business: {
        id: business.id,
        displayName: business.displayName,
        onboardingState,
      },
    });
  } catch (error) {
    sendAppError(res, error);
  }
});

const ttsSchema = z.object({
  phoneNumberId: z.string().optional(),
  label: z.string().trim().min(1).optional(),
  ttsText: z.string().trim().min(1),
});

settingsRouter.post("/greetings/tts", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const input = ttsSchema.parse(req.body);
    const phoneNumber =
      input.phoneNumberId != null
        ? await prisma.phoneNumber.findFirst({
            where: { id: input.phoneNumberId, businessId: viewer.businessId! },
          })
        : await getPrimaryPhoneNumberForBusiness(viewer.businessId!);

    if (!phoneNumber) {
      throw new AppError(400, "bad_request", "Phone number is required before creating greetings");
    }

    const greeting = await prisma.voicemailGreeting.create({
      data: {
        businessId: viewer.businessId!,
        phoneNumberId: phoneNumber.id,
        mode: "TTS",
        label: input.label ?? "Text-to-speech greeting",
        ttsText: input.ttsText,
      },
    });

    await syncBusinessOnboardingState(viewer.businessId!);
    res.status(201).json({ greeting });
  } catch (error) {
    sendAppError(res, error);
  }
});

settingsRouter.post("/greetings/recorded", requireUser, requireBusiness, upload.single("file"), async (req, res) => {
  try {
    const viewer = req.viewer!;
    const phoneNumberId = typeof req.body.phoneNumberId === "string" ? req.body.phoneNumberId : undefined;
    const phoneNumber =
      phoneNumberId != null
        ? await prisma.phoneNumber.findFirst({
            where: { id: phoneNumberId, businessId: viewer.businessId! },
          })
        : await getPrimaryPhoneNumberForBusiness(viewer.businessId!);

    if (!phoneNumber) {
      throw new AppError(400, "bad_request", "Phone number is required before creating greetings");
    }
    if (!req.file) {
      throw new AppError(400, "bad_request", "Greeting audio file is required");
    }

    const label = typeof req.body.label === "string" ? req.body.label : "Recorded greeting";
    const uploaded = await uploadGreetingFile(req.file.path, req.file.originalname);
    const greeting = await prisma.voicemailGreeting.create({
      data: {
        businessId: viewer.businessId!,
        phoneNumberId: phoneNumber.id,
        mode: "RECORDED",
        label,
        audioStorageKey: uploaded.storageKey,
        audioUrl: uploaded.publicUrl,
      },
    });
    await syncBusinessOnboardingState(viewer.businessId!);
    res.status(201).json({ greeting });
  } catch (error) {
    sendAppError(res, error);
  }
});

settingsRouter.post("/greetings/:id/activate", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const greetingId = String(req.params.id);
    const idempotencyKey = req.header("Idempotency-Key")?.trim();
    if (!idempotencyKey) {
      throw new AppError(400, "bad_request", "Idempotency-Key header is required");
    }
    const requestHash = hashRequestBody({ id: greetingId });
    const claim = await claimIdempotency({
      businessId: viewer.businessId!,
      actorUserId: viewer.userId,
      operation: IdempotencyOperation.ACTIVATE_GREETING,
      key: idempotencyKey,
      requestHash,
    });
    if (claim.handled) {
      res.status(claim.statusCode).json(claim.body);
      return;
    }

    const greeting = await prisma.voicemailGreeting.findFirst({
      where: {
        id: greetingId,
        businessId: viewer.businessId!,
      },
    });

    if (!greeting) {
      throw new AppError(404, "not_found", "Greeting not found");
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.voicemailGreeting.updateMany({
        where: { phoneNumberId: greeting.phoneNumberId },
        data: { isActive: false },
      });
      const activated = await tx.voicemailGreeting.update({
        where: { id: greeting.id },
        data: { isActive: true },
      });
      return { greeting: activated };
    });

    await syncBusinessOnboardingState(viewer.businessId!);
    await resolveIdempotency(claim.recordId, 200, result);
    res.json(result);
  } catch (error) {
    sendAppError(res, error);
  }
});
