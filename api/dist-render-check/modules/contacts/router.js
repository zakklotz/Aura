import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { normalizeToE164 } from "../../lib/phone.js";
import { sendAppError, AppError } from "../../lib/errors.js";
import { requireBusiness, requireUser } from "../../middleware/auth.js";
export const contactsRouter = Router();
contactsRouter.get("/", requireUser, requireBusiness, async (req, res) => {
    try {
        const viewer = req.viewer;
        const contacts = await prisma.contact.findMany({
            where: { businessId: viewer.businessId },
            include: {
                phoneNumbers: true,
            },
            orderBy: [{ displayName: "asc" }],
        });
        res.json({ contacts });
    }
    catch (error) {
        sendAppError(res, error);
    }
});
const createContactSchema = z.object({
    displayName: z.string().trim().min(1),
    notes: z.string().trim().optional(),
    phoneNumbers: z.array(z.object({ e164: z.string().min(1), label: z.string().trim().optional() })).min(1),
});
contactsRouter.post("/", requireUser, requireBusiness, async (req, res) => {
    try {
        const viewer = req.viewer;
        const input = createContactSchema.parse(req.body);
        const normalizedNumbers = input.phoneNumbers.map((item) => ({
            e164: normalizeToE164(item.e164),
            label: item.label,
        }));
        const existing = await prisma.contactPhoneNumber.findFirst({
            where: {
                businessId: viewer.businessId,
                e164: { in: normalizedNumbers.map((item) => item.e164) },
            },
        });
        if (existing) {
            throw new AppError(409, "conflict", "A contact with one of these numbers already exists");
        }
        const contact = await prisma.contact.create({
            data: {
                businessId: viewer.businessId,
                displayName: input.displayName,
                notes: input.notes,
                source: "MANUAL",
                isManuallyEdited: true,
                phoneNumbers: {
                    create: normalizedNumbers.map((item, index) => ({
                        businessId: viewer.businessId,
                        e164: item.e164,
                        label: item.label,
                        isPrimary: index === 0,
                        source: "MANUAL",
                        manuallyEditedAt: new Date(),
                    })),
                },
            },
            include: { phoneNumbers: true },
        });
        res.status(201).json({ contact });
    }
    catch (error) {
        sendAppError(res, error);
    }
});
const updateContactSchema = z.object({
    displayName: z.string().trim().min(1).optional(),
    notes: z.string().trim().nullable().optional(),
});
contactsRouter.patch("/:id", requireUser, requireBusiness, async (req, res) => {
    try {
        const viewer = req.viewer;
        const contactId = String(req.params.id);
        const input = updateContactSchema.parse(req.body);
        const contact = await prisma.contact.updateMany({
            where: {
                id: contactId,
                businessId: viewer.businessId,
            },
            data: {
                displayName: input.displayName,
                notes: input.notes ?? undefined,
                isManuallyEdited: true,
            },
        });
        if (contact.count === 0) {
            throw new AppError(404, "not_found", "Contact not found");
        }
        const updated = await prisma.contact.findUniqueOrThrow({
            where: { id: contactId },
            include: { phoneNumbers: true },
        });
        res.json({ contact: updated });
    }
    catch (error) {
        sendAppError(res, error);
    }
});
