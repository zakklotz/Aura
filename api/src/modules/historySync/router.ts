import { Router } from "express";
import { requireBusiness, requireUser } from "../../middleware/auth.js";
import { sendAppError } from "../../lib/errors.js";
import { getHistorySyncStatus, startHistorySync } from "./service.js";

export const historySyncRouter = Router();

historySyncRouter.get("/", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    res.json(await getHistorySyncStatus(viewer.businessId!));
  } catch (error) {
    sendAppError(res, error);
  }
});

historySyncRouter.post("/", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    res.status(202).json(await startHistorySync(viewer.businessId!));
  } catch (error) {
    sendAppError(res, error);
  }
});
