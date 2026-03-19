import { Router } from "express";
import { z } from "zod";
import { requireBusiness, requireUser } from "../../middleware/auth.js";
import { sendAppError } from "../../lib/errors.js";
import { listMailbox } from "../threads/service.js";

export const mailboxRouter = Router();

const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

mailboxRouter.get("/", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const input = paginationSchema.parse(req.query);
    res.json(
      await listMailbox({
        businessId: viewer.businessId!,
        cursor: input.cursor,
        limit: input.limit,
      })
    );
  } catch (error) {
    sendAppError(res, error);
  }
});
