import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? "3001"),
  apiBaseUrl: process.env.API_BASE_URL?.trim() ?? `http://localhost:${process.env.PORT ?? "3001"}`,
  databaseUrl: process.env.DATABASE_URL,
  clerkSecretKey: process.env.CLERK_SECRET_KEY?.trim() ?? "",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID?.trim() ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN?.trim() ?? "",
  twilioApiKeySid: process.env.TWILIO_API_KEY_SID?.trim() ?? "",
  twilioApiKeySecret: process.env.TWILIO_API_KEY_SECRET?.trim() ?? "",
  twilioTwimlAppSid: process.env.TWILIO_TWIML_APP_SID?.trim() ?? "",
  twilioPushCredentialSid: process.env.TWILIO_PUSH_CREDENTIAL_SID?.trim() ?? "",
  twilioCallerId: process.env.TWILIO_CALLER_ID?.trim() ?? "",
  twilioWebhookAuthToken: process.env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim() || process.env.TWILIO_AUTH_TOKEN?.trim() || "",
  r2AccountId: process.env.R2_ACCOUNT_ID?.trim() ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "",
  r2Bucket: process.env.R2_BUCKET?.trim() ?? "",
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.trim() ?? "",
};

export function requireApiBaseUrl(): string {
  return env.apiBaseUrl.replace(/\/$/, "");
}

export function hasTwilioVoiceConfig(): boolean {
  return Boolean(env.twilioAccountSid && env.twilioApiKeySid && env.twilioApiKeySecret && env.twilioTwimlAppSid);
}

export function hasTwilioMessagingConfig(): boolean {
  return Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioCallerId);
}

export function hasR2Config(): boolean {
  return Boolean(env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey && env.r2Bucket && env.r2PublicBaseUrl);
}

export { required };
