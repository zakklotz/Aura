import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireUser } from "../../middleware/auth.js";
import { syncBusinessOnboardingState } from "../businesses/service.js";
import { getPrimaryPhoneNumberForBusiness } from "../phoneNumbers/service.js";
import { sendAppError, AppError } from "../../lib/errors.js";
export const authRouter = Router();
authRouter.get("/bootstrap", requireUser, async (req, res) => {
    try {
        const viewer = req.viewer;
        const user = await prisma.user.upsert({
            where: { id: viewer.userId },
            create: {
                id: viewer.userId,
                email: viewer.email,
                firstName: viewer.firstName,
                lastName: viewer.lastName,
            },
            update: {
                email: viewer.email,
                firstName: viewer.firstName,
                lastName: viewer.lastName,
            },
        });
        let membership = viewer.membership;
        if (!membership) {
            const business = await prisma.business.create({
                data: {
                    displayName: null,
                    onboardingState: "NEEDS_BUSINESS_PROFILE",
                    memberships: {
                        create: {
                            userId: user.id,
                            role: "OWNER",
                        },
                    },
                },
                include: {
                    memberships: true,
                },
            });
            membership = business.memberships[0] ?? null;
            if (!membership) {
                throw new AppError(500, "internal_error", "Failed to create business membership");
            }
            await prisma.userPreference.upsert({
                where: { userId: user.id },
                create: {
                    userId: user.id,
                    activeBusinessId: business.id,
                },
                update: {
                    activeBusinessId: business.id,
                },
            });
        }
        else {
            await prisma.userPreference.upsert({
                where: { userId: user.id },
                create: {
                    userId: user.id,
                    activeBusinessId: membership.businessId,
                },
                update: {
                    activeBusinessId: membership.businessId,
                },
            });
        }
        const business = await prisma.business.findUniqueOrThrow({
            where: { id: membership.businessId },
        });
        const onboardingState = await syncBusinessOnboardingState(business.id);
        const primaryPhoneNumber = await getPrimaryPhoneNumberForBusiness(business.id);
        res.json({
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
            },
            business: {
                id: business.id,
                displayName: business.displayName,
                onboardingState,
                role: membership.role,
            },
            primaryPhoneNumber: primaryPhoneNumber
                ? {
                    id: primaryPhoneNumber.id,
                    e164: primaryPhoneNumber.e164,
                    label: primaryPhoneNumber.label,
                }
                : null,
            device: {
                deviceId: viewer.currentDeviceId,
                voiceRegistrationState: viewer.voiceRegistrationState,
                twilioIdentity: viewer.currentDeviceRegistration?.twilioIdentity ?? null,
                lastRegisteredAt: viewer.currentDeviceRegistration?.lastRegisteredAt?.toISOString() ?? null,
                lastRegistrationErrorCode: viewer.currentDeviceRegistration?.lastRegistrationErrorCode ?? null,
                lastRegistrationErrorMessage: viewer.currentDeviceRegistration?.lastRegistrationErrorMessage ?? null,
            },
        });
    }
    catch (error) {
        sendAppError(res, error);
    }
});
const setBusinessProfileSchema = z.object({
    displayName: z.string().trim().min(1),
});
authRouter.patch("/bootstrap/business-profile", requireUser, async (req, res) => {
    try {
        const viewer = req.viewer;
        if (!viewer.businessId) {
            throw new AppError(404, "not_found", "No active business");
        }
        const input = setBusinessProfileSchema.parse(req.body);
        const business = await prisma.business.update({
            where: { id: viewer.businessId },
            data: { displayName: input.displayName },
        });
        const onboardingState = await syncBusinessOnboardingState(business.id);
        res.json({
            business: {
                id: business.id,
                displayName: business.displayName,
                onboardingState,
            },
        });
    }
    catch (error) {
        sendAppError(res, error);
    }
});
