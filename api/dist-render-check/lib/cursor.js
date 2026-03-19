import { AppError } from "./errors.js";
export function encodeCursor(payload) {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}
export function decodeCursor(cursor) {
    if (!cursor)
        return null;
    try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (!parsed.id || !parsed.occurredAt) {
            throw new Error("Invalid cursor");
        }
        return parsed;
    }
    catch {
        throw new AppError(400, "bad_request", "Cursor is invalid");
    }
}
