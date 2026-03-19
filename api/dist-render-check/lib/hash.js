import crypto from "node:crypto";
export function stableJson(value) {
    return JSON.stringify(value, Object.keys(value).sort());
}
export function hashRequestBody(value) {
    return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}
