import { getClerkInstance } from "@clerk/clerk-expo";
import { getOrCreateDeviceId } from "../device/deviceIdentity";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

async function buildHeaders(): Promise<Record<string, string>> {
  const deviceId = await getOrCreateDeviceId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-device-id": deviceId,
  };

  const clerk = getClerkInstance();
  const token = clerk?.session ? await clerk.session.getToken() : null;
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
  const headers = await buildHeaders();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const errorMessage =
      errorBody && typeof errorBody === "object" && "error" in errorBody
        ? JSON.stringify(errorBody.error)
        : `Request failed with ${response.status}`;
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
