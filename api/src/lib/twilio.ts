import twilio from "twilio";
import { env, hasTwilioMessagingConfig, hasTwilioVoiceConfig, requireApiBaseUrl } from "./env.js";

export const twilioClient =
  env.twilioAccountSid && env.twilioAuthToken
    ? twilio(env.twilioAccountSid, env.twilioAuthToken)
    : null;

export function validateTwilioSignature(url: string, signature: string | undefined, body: Record<string, string | string[] | undefined>): boolean {
  if (!signature || !env.twilioWebhookAuthToken) return false;
  return twilio.validateRequest(env.twilioWebhookAuthToken, signature, url, body);
}

export function createVoiceAccessToken(identity: string): string {
  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(env.twilioAccountSid, env.twilioApiKeySid, env.twilioApiKeySecret, {
    identity,
    ttl: 60 * 60,
  });

  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: env.twilioTwimlAppSid,
      incomingAllow: true,
      pushCredentialSid: env.twilioPushCredentialSid || undefined,
    })
  );

  return token.toJwt();
}

export function ensureTwilioVoiceConfigured(): void {
  if (!hasTwilioVoiceConfig()) {
    throw new Error("Twilio voice configuration is incomplete");
  }
}

export function ensureTwilioMessagingConfigured(): void {
  if (!hasTwilioMessagingConfig()) {
    throw new Error("Twilio messaging configuration is incomplete");
  }
}

export function voiceStatusCallbackUrl(params: URLSearchParams): string {
  const base = `${requireApiBaseUrl()}/webhooks/twilio/voice/status`;
  return `${base}?${params.toString()}`;
}
