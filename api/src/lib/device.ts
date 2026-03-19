import type { Request } from "express";
import { VoiceRegistrationState, type DeviceRegistration } from "@prisma/client";
import { prisma } from "./prisma.js";

export function readDeviceId(req: Request): string | null {
  const header = req.header("x-device-id")?.trim();
  return header ? header : null;
}

type ResolveCurrentDeviceRegistrationInput = {
  businessId: string;
  userId: string;
  deviceId?: string | null;
};

export async function resolveCurrentDeviceRegistration(
  input: ResolveCurrentDeviceRegistrationInput
): Promise<DeviceRegistration | null> {
  if (input.deviceId) {
    const exact = await prisma.deviceRegistration.findFirst({
      where: {
        businessId: input.businessId,
        userId: input.userId,
        deviceId: input.deviceId,
      },
      orderBy: { updatedAt: "desc" },
    });
    if (exact) {
      return exact;
    }
  }

  return prisma.deviceRegistration.findFirst({
    where: {
      businessId: input.businessId,
      userId: input.userId,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export function deriveVoiceRegistrationState(registration: DeviceRegistration | null): VoiceRegistrationState {
  return registration?.voiceRegistrationState ?? VoiceRegistrationState.REGISTERING;
}
