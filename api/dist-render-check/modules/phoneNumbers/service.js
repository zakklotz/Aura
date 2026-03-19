import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
export async function getPrimaryPhoneNumberForBusiness(businessId) {
    const primary = await prisma.phoneNumber.findFirst({
        where: { businessId, isPrimary: true },
        orderBy: { createdAt: "asc" },
    });
    if (primary)
        return primary;
    return prisma.phoneNumber.findFirst({
        where: { businessId },
        orderBy: { createdAt: "asc" },
    });
}
export async function requirePrimaryPhoneNumberForBusiness(businessId) {
    const phoneNumber = await getPrimaryPhoneNumberForBusiness(businessId);
    if (!phoneNumber) {
        throw new AppError(400, "bad_request", "A primary phone number is required");
    }
    return phoneNumber;
}
export async function resolveBusinessPhoneNumberByE164(e164) {
    return prisma.phoneNumber.findFirst({
        where: { e164 },
    });
}
