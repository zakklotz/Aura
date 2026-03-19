import { AppError } from "./errors.js";

type CursorPayload = {
  occurredAt: string;
  id: string;
};

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as CursorPayload;
    if (!parsed.id || !parsed.occurredAt) {
      throw new Error("Invalid cursor");
    }
    return parsed;
  } catch {
    throw new AppError(400, "bad_request", "Cursor is invalid");
  }
}
