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

type DecodedVoiceAccessTokenPayload = {
  jti?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  sub?: string;
  grants?: {
    identity?: string;
    voice?: {
      incoming?: {
        allow?: boolean;
      };
      outgoing?: {
        application_sid?: string;
      };
      push_credential_sid?: string;
    };
  };
};

export function summarizeVoiceAccessToken(token: string) {
  try {
    const [, payloadSegment] = token.split(".");
    if (!payloadSegment) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8")) as DecodedVoiceAccessTokenPayload;
    return {
      jti: payload.jti ?? null,
      identity: payload.grants?.identity ?? null,
      issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
      issuer: payload.iss ?? null,
      subject: payload.sub ?? null,
      incomingAllowed: payload.grants?.voice?.incoming?.allow ?? null,
      outgoingApplicationSid: payload.grants?.voice?.outgoing?.application_sid ?? null,
      pushCredentialSid: payload.grants?.voice?.push_credential_sid ?? null,
    };
  } catch {
    return null;
  }
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
