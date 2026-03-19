import { describe, expect, it } from "vitest";
import { normalizeToE164 } from "../src/lib/phone.js";

describe("normalizeToE164", () => {
  it("normalizes ten-digit US numbers", () => {
    expect(normalizeToE164("(617) 555-1212")).toBe("+16175551212");
  });

  it("preserves valid international formatting", () => {
    expect(normalizeToE164("+442071838750")).toBe("+442071838750");
  });
});
