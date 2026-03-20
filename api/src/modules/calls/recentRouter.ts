import { Router } from "express";
import { z } from "zod";
import { requireBusiness, requireUser } from "../../middleware/auth.js";
import { sendAppError } from "../../lib/errors.js";
import { listRecentCalls } from "./recentService.js";

export const recentCallsRouter = Router();

const recentCallsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

recentCallsRouter.get("/recent", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const input = recentCallsQuerySchema.parse(req.query);
    res.json(
      await listRecentCalls({
        businessId: viewer.businessId!,
        limit: input.limit,
      })
    );
  } catch (error) {
    sendAppError(res, error);
  }
});
