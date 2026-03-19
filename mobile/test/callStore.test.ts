import { useCallStore } from "../src/store/callStore";

describe("callStore", () => {
  it("tracks call and voice registration state independently", () => {
    useCallStore.getState().setCallState("ready");
    useCallStore.getState().setVoiceRegistrationState("degraded");

    expect(useCallStore.getState().callState).toBe("ready");
    expect(useCallStore.getState().voiceRegistrationState).toBe("degraded");
  });
});
