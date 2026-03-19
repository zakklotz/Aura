import { beforeEach, describe, expect, it } from "@jest/globals";
import { useCallStore } from "./callStore";

describe("callStore", () => {
  beforeEach(() => {
    useCallStore.getState().resetVoiceState();
    useCallStore.getState().setDeviceId(null);
  });

  it("stores and clears call session fields explicitly", () => {
    useCallStore.getState().setCallSession({
      callSid: "CA123",
      direction: "outbound",
      phoneNumberId: "pn_123",
      externalParticipantE164: "+16175551212",
    });

    expect(useCallStore.getState().callSid).toBe("CA123");
    expect(useCallStore.getState().externalParticipantE164).toBe("+16175551212");

    useCallStore.getState().setCallSession({
      callSid: null,
      direction: null,
      phoneNumberId: null,
      externalParticipantE164: null,
    });

    expect(useCallStore.getState().callSid).toBeNull();
    expect(useCallStore.getState().direction).toBeNull();
    expect(useCallStore.getState().phoneNumberId).toBeNull();
    expect(useCallStore.getState().externalParticipantE164).toBeNull();
  });

  it("resets voice lifecycle fields", () => {
    useCallStore.getState().setCallState("active");
    useCallStore.getState().setVoiceRegistrationState("ready");
    useCallStore.getState().setVoiceError({
      code: "CALL_CONNECT_ERROR",
      message: "failed",
    });
    useCallStore.getState().setPendingInviteUuid("invite-1");

    useCallStore.getState().resetVoiceState();

    expect(useCallStore.getState().callState).toBe("idle");
    expect(useCallStore.getState().voiceRegistrationState).toBe("registering");
    expect(useCallStore.getState().lastVoiceErrorCode).toBeNull();
    expect(useCallStore.getState().pendingInviteUuid).toBeNull();
  });
});
