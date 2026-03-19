import { Router } from "express";
import { z } from "zod";
import { IdempotencyOperation } from "@prisma/client";
import { claimIdempotency, resolveIdempotency } from "../../lib/idempotency.js";
import { hashRequestBody } from "../../lib/hash.js";
import { sendAppError, AppError } from "../../lib/errors.js";
import { requireBusiness, requireUser } from "../../middleware/auth.js";
import { listMailbox, markVoicemailHeard } from "../threads/service.js";
import { prisma } from "../../lib/prisma.js";
export const voicemailsRouter = Router();
const paginationSchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});
voicemailsRouter.get("/mailbox", requireUser, requireBusiness, async (req, res) => {
    try {
        const viewer = req.viewer;
        const input = paginationSchema.parse(req.query);
        res.json(await listMailbox({
            businessId: viewer.businessId,
            cursor: input.cursor,
            limit: input.limit,
        }));
    }
    catch (error) {
        sendAppError(res, error);
    }
});
voicemailsRouter.get("/:id", requireUser, requireBusiness, async (req, res) => {
    try {
        const viewer = req.viewer;
        const voicemailId = String(req.params.id);
        const voicemail = await prisma.voicemail.findFirst({
            where: { id: voicemailId, businessId: viewer.businessId },
        });
        if (!voicemail) {
            throw new AppError(404, "not_found", "Voicemail not found");
        }
        const threadItem = await prisma.threadItem.findFirst({
            where: {
                businessId: viewer.businessId,
                itemType: "VOICEMAIL",
                payloadRefType: "VOICEMAIL",
                payloadRefId: voicemail.id,
            },
        });
        res.json({
            voicemail,
            heard: threadItem?.unreadState === "HEARD",
        });
    }
    catch (error) {
        sendAppError(res, error);
    }
});
voicemailsRouter.post("/:id/heard", requireUser, requireBusiness, async (req, res) => {
    try {
        const viewer = req.viewer;
        const voicemailId = String(req.params.id);
        const idempotencyKey = req.header("Idempotency-Key")?.trim();
        if (!idempotencyKey) {
            throw new AppError(400, "bad_request", "Idempotency-Key header is required");
        }
        const requestHash = hashRequestBody({ voicemailId });
        const claim = await claimIdempotency({
            businessId: viewer.businessId,
            actorUserId: viewer.userId,
            operation: IdempotencyOperation.MARK_VOICEMAIL_HEARD,
            key: idempotencyKey,
            requestHash,
        });
        if (claim.handled) {
            res.status(claim.statusCode).json(claim.body);
            return;
        }
        const result = await markVoicemailHeard(voicemailId, viewer.businessId);
        await resolveIdempotency(claim.recordId, 200, result);
        res.json(result);
    }
    catch (error) {
        sendAppError(res, error);
    }
});
