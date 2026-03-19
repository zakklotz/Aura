import type { BusinessMembership, DeviceRegistration, MembershipRole, VoiceRegistrationState } from "@prisma/client";
import type { Request } from "express";

export type ViewerContext = {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  businessId: string | null;
  membership: BusinessMembership | null;
  currentDeviceId: string | null;
  currentDeviceRegistration: DeviceRegistration | null;
  voiceRegistrationState: VoiceRegistrationState;
};

export type ViewerRequest = Request & {
  viewer: ViewerContext;
};

export type BootstrapResponse = {
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  business: {
    id: string;
    displayName: string | null;
    onboardingState: string;
    role: MembershipRole | null;
  } | null;
  primaryPhoneNumber: {
    id: string;
    e164: string;
    label: string | null;
  } | null;
  device: {
    deviceId: string | null;
    voiceRegistrationState: VoiceRegistrationState;
    twilioIdentity: string | null;
    lastRegisteredAt: string | null;
    lastRegistrationErrorCode: string | null;
    lastRegistrationErrorMessage: string | null;
  };
};
