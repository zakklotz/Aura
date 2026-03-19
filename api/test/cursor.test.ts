import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../src/lib/cursor.js";

describe("cursor helpers", () => {
  it("round trips cursor payloads", () => {
    const encoded = encodeCursor({
      occurredAt: "2026-03-18T00:00:00.000Z",
      id: "cursor-id",
    });

    expect(decodeCursor(encoded)).toEqual({
      occurredAt: "2026-03-18T00:00:00.000Z",
      id: "cursor-id",
    });
  });
});
