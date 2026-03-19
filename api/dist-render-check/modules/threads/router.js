import { Router } from "express";
import { z } from "zod";
import { sendAppError } from "../../lib/errors.js";
import { requireBusiness, requireUser } from "../../middleware/auth.js";
import { getThreadById, listThreadItems, listThreads, markThreadRead } from "./service.js";
export const threadsRouter = Router();
const paginationSchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});
threadsRouter.get("/", requireUser, requireBusiness, async (req, res) => {
    try {
        const viewer = req.viewer;
        const input = paginationSchema.parse(req.query);
        const result = await listThreads({
            businessId: viewer.businessId,
            cursor: input.cursor,
            limit: input.limit,
        });
        res.json(result);
    }
    catch (error) {
        sendAppError(res, error);
    }
});
threadsRouter.get("/:threadId", requireUser, requireBusiness, async (req, res) => {
    try {
        const viewer = req.viewer;
        const threadId = String(req.params.threadId);
        const input = paginationSchema.parse(req.query);
        const thread = await getThreadById(viewer.businessId, threadId);
        const items = await listThreadItems({
            businessId: viewer.businessId,
            threadId,
            cursor: input.cursor,
            limit: input.limit,
        });
        res.json({
            thread: {
                id: thread.id,
                businessId: thread.businessId,
                phoneNumberId: thread.phoneNumberId,
                externalParticipantE164: thread.externalParticipantE164,
                title: thread.contact?.displayName ?? thread.externalParticipantE164,
                lastOccurredAt: thread.lastOccurredAt,
                totalUnreadCount: thread.totalUnreadCount,
            },
            ...items,
        });
    }
    catch (error) {
        sendAppError(res, error);
    }
});
threadsRouter.post("/:threadId/read", requireUser, requireBusiness, async (req, res) => {
    try {
        const viewer = req.viewer;
        const result = await markThreadRead({
            businessId: viewer.businessId,
            threadId: String(req.params.threadId),
        });
        res.json(result);
    }
    catch (error) {
        sendAppError(res, error);
    }
});
