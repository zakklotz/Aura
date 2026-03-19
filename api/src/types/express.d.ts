import type { BusinessMembership, DeviceRegistration, VoiceRegistrationState } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      viewer?: {
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
    }
  }
}

export {};
