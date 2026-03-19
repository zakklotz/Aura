import { apiFetch } from "./client";

export type VoiceRegistrationState = "READY" | "DEGRADED" | "REGISTERING";
export type CallState =
  | "idle"
  | "registering"
  | "ready"
  | "incoming"
  | "answering"
  | "outgoing_dialing"
  | "connecting"
  | "active"
  | "ended"
  | "failed";

export type BootstrapPayload = {
  user: { id: string; email: string | null; firstName: string | null; lastName: string | null };
  business: { id: string; displayName: string | null; onboardingState: string; role: string | null } | null;
  primaryPhoneNumber: { id: string; e164: string; label: string | null } | null;
  device: {
    deviceId: string | null;
    voiceRegistrationState: VoiceRegistrationState;
    twilioIdentity: string | null;
    lastRegisteredAt: string | null;
    lastRegistrationErrorCode: string | null;
    lastRegistrationErrorMessage: string | null;
  };
};

export type ThreadsPayload = {
  items: Array<{
    id: string;
    title: string;
    subtitle: string | null;
    lastOccurredAt: string;
    unreadSmsCount: number;
    unreadMissedCallCount: number;
    unheardVoicemailCount: number;
    totalUnreadCount: number;
  }>;
  nextCursor: string | null;
};

export function fetchBootstrap() {
  return apiFetch<BootstrapPayload>("/api/auth/bootstrap");
}

export function fetchThreads() {
  return apiFetch<ThreadsPayload>("/api/threads");
}

export function fetchThread(threadId: string) {
  return apiFetch<{
    thread: {
      id: string;
      title: string;
      totalUnreadCount: number;
      lastOccurredAt: string;
      externalParticipantE164: string;
    };
    items: Array<{
      id: string;
      itemType: string;
      occurredAt: string;
      unreadState: string;
      previewText: string | null;
      payload: unknown;
    }>;
    nextCursor: string | null;
  }>(`/api/threads/${threadId}`);
}

export function markThreadRead(threadId: string) {
  return apiFetch<{ ok: true }>(`/api/threads/${threadId}/read`, { method: "POST" });
}

export function fetchMailbox() {
  return apiFetch<{
    items: Array<{
      id: string;
      threadId: string;
      voicemailId: string | null;
      title: string;
      occurredAt: string;
      unheard: boolean;
      durationSeconds: number | null;
      transcriptStatus: string | null;
      transcriptSnippet: string | null;
    }>;
    nextCursor: string | null;
  }>("/api/mailbox");
}

export function fetchContacts() {
  return apiFetch<{
    contacts: Array<{
      id: string;
      displayName: string;
      notes: string | null;
      phoneNumbers: Array<{ id: string; e164: string; label: string | null }>;
    }>;
  }>("/api/contacts");
}

export function fetchSettings() {
  return apiFetch("/api/settings/communication");
}

export type CallSessionPayload = {
  session: {
    id: string | null;
    state: CallState;
    callSid: string | null;
    phoneNumberId: string | null;
    externalParticipantE164: string | null;
    direction: "inbound" | "outbound" | null;
    updatedAt: string;
    occurredAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  };
  device: {
    deviceId: string | null;
    twilioIdentity: string | null;
    voiceRegistrationState: Lowercase<VoiceRegistrationState>;
    lastRegisteredAt: string | null;
    lastRegistrationErrorCode: string | null;
    lastRegistrationErrorMessage: string | null;
  };
};

export function fetchCallSession() {
  return apiFetch<CallSessionPayload>("/api/call-session");
}

export function fetchVoiceAccessToken() {
  return apiFetch<{
    token: string;
    identity: string;
    issuedAt: string;
    expiresAt: string;
    refreshAfter: string;
    voiceRegistrationState: VoiceRegistrationState;
  }>("/api/voice/access-token");
}

export function registerDevice(input: {
  deviceId: string;
  platform: "IOS" | "ANDROID";
  appBuild?: string;
  appRuntimeVersion?: string;
  expoPushToken?: string;
  voicePushToken?: string;
  twilioIdentity?: string;
  voiceRegistrationState: VoiceRegistrationState;
  lastRegistrationErrorCode?: string;
  lastRegistrationErrorMessage?: string;
}) {
  return apiFetch<{ registration: unknown }>("/api/devices/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function unregisterDevice(deviceId: string) {
  return apiFetch<{ ok: true }>("/api/devices/unregister", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  });
}

export function postCallSessionEvent(input: {
  state: "incoming" | "answering" | "outgoing_dialing" | "connecting" | "active" | "ended" | "failed";
  occurredAt: string;
  callSid?: string | null;
  parentCallSid?: string | null;
  childCallSid?: string | null;
  direction?: "inbound" | "outbound" | null;
  phoneNumberId?: string | null;
  externalParticipantE164?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  return apiFetch<{
    session: {
      id: string;
      state: string;
      callSid: string | null;
      externalParticipantE164: string | null;
    };
  }>("/api/voice/call-session/events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createOutboundSession(input: { to: string; phoneNumberId?: string | null }) {
  return apiFetch<{
    ok: true;
    sessionId: string;
    externalParticipantE164: string;
    phoneNumberId: string;
  }>("/api/voice/outbound", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
