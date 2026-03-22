import { Router } from "express";
import { z } from "zod";
import { IdempotencyOperation, MessageDeliveryStatus, ThreadItemType, UnreadState } from "@prisma/client";
import { claimIdempotency, resolveIdempotency } from "../../lib/idempotency.js";
import { hashRequestBody } from "../../lib/hash.js";
import { AppError, sendAppError } from "../../lib/errors.js";
import { requireApiBaseUrl } from "../../lib/env.js";
import { normalizeToE164 } from "../../lib/phone.js";
import { requireBusiness, requireUser } from "../../middleware/auth.js";
import { getPrimaryPhoneNumberForBusiness } from "../phoneNumbers/service.js";
import { prisma } from "../../lib/prisma.js";
import { projectThreadItem } from "../threads/service.js";
import { ensureTwilioMessagingConfigured, twilioClient } from "../../lib/twilio.js";

export const messagesRouter = Router();

const sendMessageSchema = z.object({
  to: z.string().min(1),
  body: z.string().trim().min(1),
  phoneNumberId: z.string().optional(),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  clientTempId: z.string().optional(),
});

messagesRouter.post("/", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const idempotencyKey = req.header("Idempotency-Key")?.trim();
    if (!idempotencyKey) {
      throw new AppError(400, "bad_request", "Idempotency-Key header is required");
    }

    const input = sendMessageSchema.parse(req.body);
    const businessId = viewer.businessId!;
    const phoneNumber =
      input.phoneNumberId != null
        ? await prisma.phoneNumber.findFirst({
            where: {
              id: input.phoneNumberId,
              businessId,
            },
          })
        : await getPrimaryPhoneNumberForBusiness(businessId);

    if (!phoneNumber) {
      throw new AppError(400, "bad_request", "No business phone number is configured");
    }

    const requestHash = hashRequestBody(input);
    const claim = await claimIdempotency({
      businessId,
      actorUserId: viewer.userId,
      operation: IdempotencyOperation.SEND_SMS,
      key: idempotencyKey,
      requestHash,
    });

    if (claim.handled) {
      res.status(claim.statusCode).json(claim.body);
      return;
    }

    const to = normalizeToE164(input.to);
    const ensuredThread = await prisma.$transaction(async (tx) => {
      const contactNumber = await tx.contactPhoneNumber.findUnique({
        where: {
          businessId_e164: {
            businessId,
            e164: to,
          },
        },
        include: {
          contact: true,
        },
      });

      const existing = await tx.thread.findUnique({
        where: {
          businessId_phoneNumberId_externalParticipantE164: {
            businessId,
            phoneNumberId: phoneNumber.id,
            externalParticipantE164: to,
          },
        },
      });

      if (existing) return existing;

      return tx.thread.create({
        data: {
          businessId,
          phoneNumberId: phoneNumber.id,
          externalParticipantE164: to,
          contactId: contactNumber?.contact?.id ?? null,
          participants: {
            create: [
              { kind: "BUSINESS_NUMBER", phoneNumberId: phoneNumber.id },
              { kind: "EXTERNAL", externalParticipantE164: to, contactId: contactNumber?.contact?.id ?? null },
            ],
          },
        },
      });
    });

    const message = await prisma.message.create({
      data: {
        businessId,
        phoneNumberId: phoneNumber.id,
        threadId: ensuredThread.id,
        externalParticipantE164: to,
        direction: "OUTBOUND",
        body: input.body,
        mediaUrls: input.mediaUrls ?? [],
        clientTempId: input.clientTempId ?? null,
        deliveryStatus: MessageDeliveryStatus.PENDING,
      },
    });

    await projectThreadItem({
      businessId,
      phoneNumberId: phoneNumber.id,
      externalParticipantE164: to,
      itemType: ThreadItemType.SMS_OUTBOUND,
      unreadState: UnreadState.READ,
      payloadRefType: "MESSAGE",
      payloadRefId: message.id,
      dedupeKey: `message:${message.id}`,
      occurredAt: message.createdAt,
      previewText: input.body,
    });

    try {
      ensureTwilioMessagingConfigured();
      const statusCallback = new URL(`${requireApiBaseUrl()}/webhooks/twilio/sms/status`);
      const created = await twilioClient!.messages.create({
        from: phoneNumber.e164,
        to,
        body: input.body,
        mediaUrl: input.mediaUrls,
        statusCallback: statusCallback.toString(),
      });
      const updated = await prisma.message.update({
        where: { id: message.id },
        data: {
          messageSid: created.sid,
          providerStatus: created.status ?? "queued",
          deliveryStatus: created.status === "failed" ? MessageDeliveryStatus.FAILED : MessageDeliveryStatus.QUEUED,
        },
      });
      const body = { message: updated };
      await resolveIdempotency(claim.recordId, 201, body);
      res.status(201).json(body);
    } catch (error) {
      const updated = await prisma.message.update({
        where: { id: message.id },
        data: {
          deliveryStatus: MessageDeliveryStatus.FAILED,
          errorCode: "SMS_SEND_ERROR",
          providerStatus: error instanceof Error ? error.message.slice(0, 120) : "send_failed",
        },
      });
      const body = { message: updated };
      await resolveIdempotency(claim.recordId, 202, body);
      res.status(202).json(body);
    }
  } catch (error) {
    sendAppError(res, error);
  }
});
