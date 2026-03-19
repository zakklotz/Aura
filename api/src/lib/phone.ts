import { AppError } from "./errors.js";

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeToE164(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError(400, "bad_request", "Phone number is required");
  }

  if (trimmed.startsWith("+")) {
    const digits = digitsOnly(trimmed);
    if (digits.length < 10 || digits.length > 15) {
      throw new AppError(400, "bad_request", "Phone number must be between 10 and 15 digits");
    }
    return `+${digits}`;
  }

  const digits = digitsOnly(trimmed);
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  throw new AppError(400, "bad_request", "Phone number format is invalid");
}

export function optionalE164(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null;
  return normalizeToE164(value);
}
