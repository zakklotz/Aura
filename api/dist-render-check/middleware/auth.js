import { clerkMiddleware, getAuth } from "@clerk/express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { readDeviceId, resolveCurrentDeviceRegistration, deriveVoiceRegistrationState } from "../lib/device.js";
export const clerkExpressMiddleware = clerkMiddleware();
function readDevelopmentUser(req) {
    const userId = req.header("x-user-id")?.trim();
    if (!userId)
        return null;
    return {
        userId,
        email: req.header("x-user-email")?.trim() ?? null,
        firstName: req.header("x-user-first-name")?.trim() ?? null,
        lastName: req.header("x-user-last-name")?.trim() ?? null,
    };
}
function getRequestUser(req) {
    const dev = readDevelopmentUser(req);
    if (dev)
        return dev;
    try {
        const auth = getAuth(req);
        if (!("userId" in auth) || !auth.userId)
            return null;
        return {
            userId: auth.userId,
            email: null,
            firstName: null,
            lastName: null,
        };
    }
    catch {
        return null;
    }
}
export const requireUser = async (req, _res, next) => {
    const user = getRequestUser(req);
    if (!user) {
        next(new AppError(401, "unauthorized", "Authentication required"));
        return;
    }
    const preferences = await prisma.userPreference.findUnique({
        where: { userId: user.userId },
    });
    const membership = preferences?.activeBusinessId
        ? await prisma.businessMembership.findFirst({
            where: {
                userId: user.userId,
                businessId: preferences.activeBusinessId,
            },
        })
        : await prisma.businessMembership.findFirst({
            where: { userId: user.userId },
            orderBy: { createdAt: "asc" },
        });
    const currentDeviceId = readDeviceId(req);
    const registration = membership
        ? await resolveCurrentDeviceRegistration({
            userId: user.userId,
            businessId: membership.businessId,
            deviceId: currentDeviceId,
        })
        : null;
    req.viewer = {
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        businessId: membership?.businessId ?? null,
        membership,
        currentDeviceId,
        currentDeviceRegistration: registration,
        voiceRegistrationState: deriveVoiceRegistrationState(registration),
    };
    next();
};
export const requireBusiness = async (req, _res, next) => {
    if (!req.viewer?.businessId || !req.viewer.membership) {
        next(new AppError(404, "not_found", "No active business context"));
        return;
    }
    next();
};
