import { describe, expect, it } from "vitest";
import { buildOutboundVoiceResponse, normalizeVoiceStatusPayload } from "../src/modules/twilio/service.js";

describe("twilio voice helpers", () => {
  it("adds child-leg progress callbacks to outbound TwiML", () => {
    const response = buildOutboundVoiceResponse({
      to: "+15551234567",
      callerId: "+15557654321",
      businessId: "biz_123",
      phoneNumberId: "pn_123",
      externalParticipantE164: "+15551234567",
    });
    const xml = response.toString();

    expect(xml).toContain("<Number");
    expect(xml).toContain('statusCallback="');
    expect(xml).toContain('statusCallbackEvent="initiated ringing answered completed"');
    expect(xml).toContain('statusCallbackMethod="POST"');
  });

  it("normalizes Twilio child progress callbacks onto the parent session", () => {
    const normalized = normalizeVoiceStatusPayload({
      businessId: "biz_123",
      phoneNumberId: "pn_123",
      externalParticipantE164: "+15551234567",
      CallSid: "CAchild",
      ParentCallSid: "CAparent",
      CallStatus: "ringing",
      CallbackSource: "call-progress-events",
      Timestamp: "Mon, 22 Mar 2026 10:15:00 +0000",
      Direction: "outbound-dial",
    });

    expect(normalized.sessionCallSid).toBe("CAparent");
    expect(normalized.callEventSid).toBe("CAchild");
    expect(normalized.parentCallSid).toBe("CAparent");
    expect(normalized.childCallSid).toBe("CAchild");
    expect(normalized.progressState).toBe("connecting");
    expect(normalized.eventType).toBe(null);
    expect(normalized.direction).toBe("outbound");
  });

  it("normalizes Dial action callbacks onto the child call event", () => {
    const normalized = normalizeVoiceStatusPayload({
      businessId: "biz_123",
      phoneNumberId: "pn_123",
      externalParticipantE164: "+15551234567",
      CallSid: "CAparent",
      DialCallSid: "CAchild",
      DialCallStatus: "completed",
      Timestamp: "Mon, 22 Mar 2026 10:15:00 +0000",
      From: "client:business_biz_123_user_user_123",
    });

    expect(normalized.sessionCallSid).toBe("CAparent");
    expect(normalized.callEventSid).toBe("CAchild");
    expect(normalized.parentCallSid).toBe("CAparent");
    expect(normalized.childCallSid).toBe("CAchild");
    expect(normalized.eventType).toBe("CALL_COMPLETED");
    expect(normalized.direction).toBe("outbound");
  });
});
