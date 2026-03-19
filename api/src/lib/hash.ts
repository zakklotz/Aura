import crypto from "node:crypto";

export function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

export function hashRequestBody(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}
