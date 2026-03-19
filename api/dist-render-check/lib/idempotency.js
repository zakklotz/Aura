import { prisma } from "./prisma.js";
function toStoredJson(value) {
    return JSON.parse(JSON.stringify(value));
}
export async function claimIdempotency(input) {
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
export async function resolveIdempotency(recordId, statusCode, body) {
    await prisma.idempotencyKey.update({
        where: { id: recordId },
        data: {
            responseStatus: statusCode,
            responseBody: toStoredJson(body),
        },
    });
}
