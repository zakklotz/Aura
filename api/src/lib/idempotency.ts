import type { IdempotencyOperation, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

function toStoredJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

type ExistingResponse = {
  handled: true;
  statusCode: number;
  body: Prisma.JsonValue;
};

type FreshClaim = {
  handled: false;
  recordId: string;
};

export async function claimIdempotency(input: {
  businessId: string;
  actorUserId: string;
  operation: IdempotencyOperation;
  key: string;
  requestHash: string;
}): Promise<ExistingResponse | FreshClaim> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      businessId_actorUserId_operation_key: {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        operation: input.operation,
        key: input.key,
      },
    },
  });

  if (existing) {
    return {
      handled: true,
      statusCode: existing.responseStatus,
      body: existing.responseBody,
    };
  }

  const created = await prisma.idempotencyKey.create({
    data: {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      operation: input.operation,
      key: input.key,
      requestHash: input.requestHash,
      responseStatus: 202,
      responseBody: { pending: true },
    },
  });

  return {
    handled: false,
    recordId: created.id,
  };
}

export async function resolveIdempotency(recordId: string, statusCode: number, body: unknown): Promise<void> {
  await prisma.idempotencyKey.update({
    where: { id: recordId },
    data: {
      responseStatus: statusCode,
      responseBody: toStoredJson(body),
    },
  });
}
