import { getClerkInstance } from "@clerk/expo";
import { getOrCreateDeviceId } from "../device/deviceIdentity";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  code: string | null;
  status: number;
  details: unknown;

  constructor(input: { message: string; code?: string | null; status: number; details?: unknown }) {
    super(input.message);
    this.name = "ApiError";
    this.code = input.code ?? null;
    this.status = input.status;
    this.details = input.details ?? null;
  }
}

function logAuthDiagnostic(message: string, input: { path: string; error?: unknown } | { path: string }) {
  const details =
    "error" in input && input.error instanceof Error
      ? input.error.message
      : "error" in input && typeof input.error === "string"
        ? input.error
        : null;

  if (details) {
    console.warn(`[apiFetch] ${message}`, { path: input.path, error: details });
    return;
  }

  console.warn(`[apiFetch] ${message}`, { path: input.path });
}

async function buildHeaders(path: string): Promise<Record<string, string>> {
  const deviceId = await getOrCreateDeviceId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-device-id": deviceId,
  };

  let token: string | null = null;

  try {
    const clerk = getClerkInstance();
    const isLoaded =
      clerk && typeof clerk === "object" && "loaded" in clerk ? Boolean((clerk as { loaded?: unknown }).loaded) : true;

    if (!isLoaded) {
      logAuthDiagnostic("Clerk is not ready yet; sending request without an auth token", { path });
    } else if (clerk?.session) {
      try {
        token = await clerk.session.getToken();
      } catch (error) {
        logAuthDiagnostic("Clerk token lookup failed before fetch", { path, error });
      }
    }
  } catch (error) {
    logAuthDiagnostic("Clerk instance lookup failed before fetch", { path, error });
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (__DEV__) {
    headers["x-user-id"] = "dev-user";
    headers["x-user-email"] = "dev@example.com";
    headers["x-user-first-name"] = "Dev";
    headers["x-user-last-name"] = "User";
  }

  return headers;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await buildHeaders(path);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    if (errorBody && typeof errorBody === "object" && "error" in errorBody && typeof errorBody.error === "object" && errorBody.error) {
      const apiError = errorBody.error as {
        code?: string | null;
        message?: string | null;
        details?: unknown;
      };
      throw new ApiError({
        status: response.status,
        code: apiError.code ?? null,
        message: apiError.message ?? `Request failed with ${response.status}`,
        details: apiError.details ?? null,
      });
    }

    throw new ApiError({
      status: response.status,
      message: `Request failed with ${response.status}`,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
