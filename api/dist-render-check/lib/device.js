import { VoiceRegistrationState } from "@prisma/client";
import { prisma } from "./prisma.js";
export function readDeviceId(req) {
    const header = req.header("x-device-id")?.trim();
    return header ? header : null;
}
export async function resolveCurrentDeviceRegistration(input) {
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
export function deriveVoiceRegistrationState(registration) {
    return registration?.voiceRegistrationState ?? VoiceRegistrationState.REGISTERING;
}
