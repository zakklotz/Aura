import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { env } from "../../lib/env.js";

async function autoProvisionConfiguredPhoneNumberForBusiness(businessId: string) {
  const configuredNumber = env.twilioPhoneNumber.trim();
  if (!configuredNumber) {
    return null;
  }

  const existingForBusiness = await prisma.phoneNumber.findFirst({
    where: {
      businessId,
      e164: configuredNumber,
    },
  });

  if (existingForBusiness) {
    if (!existingForBusiness.isPrimary) {
      return prisma.phoneNumber.update({
        where: { id: existingForBusiness.id },
        data: { isPrimary: true },
      });
    }
    return existingForBusiness;
  }

  await prisma.phoneNumber.updateMany({
    where: { businessId },
    data: { isPrimary: false },
  });

  return prisma.phoneNumber.create({
    data: {
      businessId,
      e164: configuredNumber,
      label: "Main line",
      isPrimary: true,
      smsEnabled: true,
      voiceEnabled: true,
      status: "ACTIVE",
    },
  });
}

export async function getPrimaryPhoneNumberForBusiness(businessId: string) {
  const primary = await prisma.phoneNumber.findFirst({
    where: { businessId, isPrimary: true },
    orderBy: { createdAt: "asc" },
  });

  if (primary) return primary;

  const existing = await prisma.phoneNumber.findFirst({
    where: { businessId },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    if (!existing.isPrimary) {
      return prisma.phoneNumber.update({
        where: { id: existing.id },
        data: { isPrimary: true },
      });
    }

    return existing;
  }

  return autoProvisionConfiguredPhoneNumberForBusiness(businessId);
}

export async function requirePrimaryPhoneNumberForBusiness(businessId: string) {
  const phoneNumber = await getPrimaryPhoneNumberForBusiness(businessId);
  if (!phoneNumber) {
    throw new AppError(400, "bad_request", "A primary phone number is required");
  }
  return phoneNumber;
}

export async function resolveBusinessPhoneNumberByE164(e164: string) {
  return prisma.phoneNumber.findFirst({
    where: { e164 },
  });
}
