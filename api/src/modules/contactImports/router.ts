import { Router } from "express";
import { z } from "zod";
import { IdempotencyOperation } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { normalizeToE164 } from "../../lib/phone.js";
import { claimIdempotency, resolveIdempotency } from "../../lib/idempotency.js";
import { hashRequestBody } from "../../lib/hash.js";
import { sendAppError, AppError } from "../../lib/errors.js";
import { requireBusiness, requireUser } from "../../middleware/auth.js";
export const contactImportsRouter = Router();

const importSchema = z.object({
  rows: z.array(
    z.object({
      displayName: z.string().trim().min(1),
      numbers: z.array(z.string().min(1)).min(1),
      notes: z.string().trim().optional(),
    })
  ),
});

async function runImport(viewer: NonNullable<Express.Request["viewer"]>, source: "CSV" | "PHONEBOOK", rows: z.infer<typeof importSchema>["rows"], idempotencyKey: string) {
  const job = await prisma.contactImportJob.create({
    data: {
      businessId: viewer.businessId!,
      actorUserId: viewer.userId,
      source,
      status: "PROCESSING",
      idempotencyKey,
      totalRows: rows.length,
    },
  });

  let createdCount = 0;
  let mergedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const normalizedNumbers = [...new Set(row.numbers.map((value) => normalizeToE164(value)))];
    const existingNumbers = await prisma.contactPhoneNumber.findMany({
      where: {
        businessId: viewer.businessId!,
        e164: { in: normalizedNumbers },
      },
      include: { contact: true },
    });

    if (existingNumbers.length > 0) {
      const existingManualContact = existingNumbers.find((number) => number.contact.isManuallyEdited);
      if (existingManualContact) {
        skippedCount += 1;
        continue;
      }

      const contact = existingNumbers[0]?.contact;
      if (!contact) {
        skippedCount += 1;
        continue;
      }

      const missingNumbers = normalizedNumbers.filter((number) => !existingNumbers.some((existing) => existing.e164 === number));
      if (missingNumbers.length > 0) {
        await prisma.contactPhoneNumber.createMany({
          data: missingNumbers.map((number) => ({
            businessId: viewer.businessId!,
            contactId: contact.id,
            e164: number,
            isPrimary: false,
            source,
          })),
        });
      }
      mergedCount += 1;
      continue;
    }

    await prisma.contact.create({
      data: {
        businessId: viewer.businessId!,
        displayName: row.displayName,
        notes: row.notes,
        source,
        isManuallyEdited: false,
        phoneNumbers: {
          create: normalizedNumbers.map((number, index) => ({
            businessId: viewer.businessId!,
            e164: number,
            isPrimary: index === 0,
            source,
          })),
        },
      },
    });
    createdCount += 1;
  }

  const result = await prisma.contactImportJob.update({
    where: { id: job.id },
    data: {
      status: "COMPLETED",
      createdCount,
      mergedCount,
      skippedCount,
      completedAt: new Date(),
    },
  });

  return { job: result };
}

contactImportsRouter.post("/csv", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const idempotencyKey = req.header("Idempotency-Key")?.trim();
    if (!idempotencyKey) {
      throw new AppError(400, "bad_request", "Idempotency-Key header is required");
    }
    const input = importSchema.parse(req.body);
    const claim = await claimIdempotency({
      businessId: viewer.businessId!,
      actorUserId: viewer.userId,
      operation: IdempotencyOperation.CONTACT_IMPORT,
      key: `csv:${idempotencyKey}`,
      requestHash: hashRequestBody(input),
    });
    if (claim.handled) {
      res.status(claim.statusCode).json(claim.body);
      return;
    }
    const result = await runImport(viewer, "CSV", input.rows, idempotencyKey);
    await resolveIdempotency(claim.recordId, 201, result);
    res.status(201).json(result);
  } catch (error) {
    sendAppError(res, error);
  }
});

contactImportsRouter.post("/phonebook", requireUser, requireBusiness, async (req, res) => {
  try {
    const viewer = req.viewer!;
    const idempotencyKey = req.header("Idempotency-Key")?.trim();
    if (!idempotencyKey) {
      throw new AppError(400, "bad_request", "Idempotency-Key header is required");
    }
    const input = importSchema.parse(req.body);
    const claim = await claimIdempotency({
      businessId: viewer.businessId!,
      actorUserId: viewer.userId,
      operation: IdempotencyOperation.CONTACT_IMPORT,
      key: `phonebook:${idempotencyKey}`,
      requestHash: hashRequestBody(input),
    });
    if (claim.handled) {
      res.status(claim.statusCode).json(claim.body);
      return;
    }
    const result = await runImport(viewer, "PHONEBOOK", input.rows, idempotencyKey);
    await resolveIdempotency(claim.recordId, 201, result);
    res.status(201).json(result);
  } catch (error) {
    sendAppError(res, error);
  }
});
