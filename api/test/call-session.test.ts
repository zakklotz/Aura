import { describe, expect, it } from "vitest";
import { CallSessionState } from "@prisma/client";
import {
  callSessionStatePrecedence,
  fromDbState,
  isPendingPersistedCallSessionState,
  shouldAdvanceCallSessionTransition,
  shouldEnrichEqualTimestampFailure,
} from "../src/modules/calls/sessionService.js";

describe("call session helpers", () => {
  it("uses the expected precedence order", () => {
    expect(callSessionStatePrecedence[CallSessionState.INCOMING]).toBeLessThan(
      callSessionStatePrecedence[CallSessionState.CONNECTING]
    );
    expect(callSessionStatePrecedence[CallSessionState.CONNECTING]).toBeLessThan(
      callSessionStatePrecedence[CallSessionState.ACTIVE]
    );
    expect(callSessionStatePrecedence[CallSessionState.ACTIVE]).toBeLessThan(
      callSessionStatePrecedence[CallSessionState.ENDED]
    );
    expect(callSessionStatePrecedence[CallSessionState.ENDED]).toBe(
      callSessionStatePrecedence[CallSessionState.FAILED]
    );
  });

  it("rejects out-of-order regressions", () => {
    const currentOccurredAt = new Date("2026-03-18T12:00:05.000Z");
    const olderOccurredAt = new Date("2026-03-18T12:00:04.000Z");

    expect(
      shouldAdvanceCallSessionTransition(
        CallSessionState.ACTIVE,
        currentOccurredAt,
        CallSessionState.CONNECTING,
        olderOccurredAt
      )
    ).toBe(false);
  });

  it("allows later equal-precedence terminal updates only when newer", () => {
    const currentOccurredAt = new Date("2026-03-18T12:00:05.000Z");
    const laterOccurredAt = new Date("2026-03-18T12:00:06.000Z");
    const sameOccurredAt = new Date("2026-03-18T12:00:05.000Z");

    expect(
      shouldAdvanceCallSessionTransition(
        CallSessionState.ENDED,
        currentOccurredAt,
        CallSessionState.FAILED,
        laterOccurredAt
      )
    ).toBe(true);
    expect(
      shouldAdvanceCallSessionTransition(
        CallSessionState.ENDED,
        currentOccurredAt,
        CallSessionState.FAILED,
        sameOccurredAt
      )
    ).toBe(false);
  });

  it("allows equal-timestamp failed updates to enrich error details", () => {
    const occurredAt = new Date("2026-03-18T12:00:05.000Z");

    expect(
      shouldEnrichEqualTimestampFailure(
        CallSessionState.ENDED,
        occurredAt,
        CallSessionState.FAILED,
        occurredAt,
        "CALL_CONNECT_ERROR",
        "twilio timeout"
      )
    ).toBe(true);
  });

  it("tracks pending states and serializes db states", () => {
    expect(isPendingPersistedCallSessionState("incoming")).toBe(true);
    expect(isPendingPersistedCallSessionState("connecting")).toBe(true);
    expect(isPendingPersistedCallSessionState("active")).toBe(false);
    expect(fromDbState(CallSessionState.OUTGOING_DIALING)).toBe("outgoing_dialing");
  });
});
