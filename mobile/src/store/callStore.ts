import { create } from "zustand";

export type CallState =
  | "idle"
  | "registering"
  | "ready"
  | "incoming"
  | "answering"
  | "outgoing_dialing"
  | "connecting"
  | "active"
  | "ended"
  | "failed";

export type VoiceRegistrationState = "ready" | "degraded" | "registering";

type CallStore = {
  callState: CallState;
  voiceRegistrationState: VoiceRegistrationState;
  activeThreadId: string | null;
  deviceId: string | null;
  callSid: string | null;
  direction: "inbound" | "outbound" | null;
  phoneNumberId: string | null;
  externalParticipantE164: string | null;
  pendingInviteUuid: string | null;
  tokenIssuedAt: string | null;
  tokenExpiresAt: string | null;
  tokenRefreshAfter: string | null;
  lastVoiceErrorCode: string | null;
  lastVoiceErrorMessage: string | null;
  isRecoveringFromLaunch: boolean;
  setCallState: (callState: CallState) => void;
  setVoiceRegistrationState: (voiceRegistrationState: VoiceRegistrationState) => void;
  setActiveThreadId: (activeThreadId: string | null) => void;
  setDeviceId: (deviceId: string | null) => void;
  setCallSession: (input: {
    callSid?: string | null;
    direction?: "inbound" | "outbound" | null;
    phoneNumberId?: string | null;
    externalParticipantE164?: string | null;
  }) => void;
  setPendingInviteUuid: (pendingInviteUuid: string | null) => void;
  setTokenLifecycle: (input: { issuedAt: string | null; expiresAt: string | null; refreshAfter: string | null }) => void;
  setVoiceError: (input: { code: string | null; message: string | null }) => void;
  setRecoveryState: (isRecoveringFromLaunch: boolean) => void;
  resetVoiceState: () => void;
};

export const useCallStore = create<CallStore>((set) => ({
  callState: "idle",
  voiceRegistrationState: "registering",
  activeThreadId: null,
  deviceId: null,
  callSid: null,
  direction: null,
  phoneNumberId: null,
  externalParticipantE164: null,
  pendingInviteUuid: null,
  tokenIssuedAt: null,
  tokenExpiresAt: null,
  tokenRefreshAfter: null,
  lastVoiceErrorCode: null,
  lastVoiceErrorMessage: null,
  isRecoveringFromLaunch: false,
  setCallState: (callState) => set({ callState }),
  setVoiceRegistrationState: (voiceRegistrationState) => set({ voiceRegistrationState }),
  setActiveThreadId: (activeThreadId) => set({ activeThreadId }),
  setDeviceId: (deviceId) => set({ deviceId }),
  setCallSession: (input) =>
    set((state) => ({
      callSid: "callSid" in input ? (input.callSid ?? null) : state.callSid,
      direction: "direction" in input ? (input.direction ?? null) : state.direction,
      phoneNumberId: "phoneNumberId" in input ? (input.phoneNumberId ?? null) : state.phoneNumberId,
      externalParticipantE164:
        "externalParticipantE164" in input ? (input.externalParticipantE164 ?? null) : state.externalParticipantE164,
    })),
  setPendingInviteUuid: (pendingInviteUuid) => set({ pendingInviteUuid }),
  setTokenLifecycle: ({ issuedAt, expiresAt, refreshAfter }) =>
    set({
      tokenIssuedAt: issuedAt,
      tokenExpiresAt: expiresAt,
      tokenRefreshAfter: refreshAfter,
    }),
  setVoiceError: ({ code, message }) =>
    set({
      lastVoiceErrorCode: code,
      lastVoiceErrorMessage: message,
    }),
  setRecoveryState: (isRecoveringFromLaunch) => set({ isRecoveringFromLaunch }),
  resetVoiceState: () =>
    set({
      callState: "idle",
      voiceRegistrationState: "registering",
      callSid: null,
      direction: null,
      phoneNumberId: null,
      externalParticipantE164: null,
      pendingInviteUuid: null,
      tokenIssuedAt: null,
      tokenExpiresAt: null,
      tokenRefreshAfter: null,
      lastVoiceErrorCode: null,
      lastVoiceErrorMessage: null,
      isRecoveringFromLaunch: false,
    }),
}));
