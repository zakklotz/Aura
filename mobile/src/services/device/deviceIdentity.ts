import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "aura.device_id";

function generateDeviceId(): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `device_${Date.now().toString(36)}_${random}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const deviceId = generateDeviceId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
