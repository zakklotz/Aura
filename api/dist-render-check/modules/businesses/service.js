import { BusinessOnboardingState } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
export async function deriveOnboardingState(businessId) {
    const business = await prisma.business.findUnique({
        where: { id: businessId },
        include: {
            phoneNumbers: {
                include: {
                    voicemailGreetings: {
                        where: { isActive: true },
                    },
                },
            },
        },
    });
    if (!business) {
        return BusinessOnboardingState.NEEDS_BUSINESS_PROFILE;
    }
    if (!business.displayName?.trim()) {
        return BusinessOnboardingState.NEEDS_BUSINESS_PROFILE;
    }
    if (business.phoneNumbers.length === 0) {
        return BusinessOnboardingState.NEEDS_PHONE_NUMBER;
    }
    const hasGreeting = business.phoneNumbers.some((phoneNumber) => phoneNumber.voicemailGreetings.length > 0);
    if (!hasGreeting) {
        return BusinessOnboardingState.NEEDS_GREETING;
    }
    return BusinessOnboardingState.COMPLETE;
}
export async function syncBusinessOnboardingState(businessId) {
    const onboardingState = await deriveOnboardingState(businessId);
    await prisma.business.update({
        where: { id: businessId },
        data: { onboardingState },
    });
    return onboardingState;
}
