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

export type HistorySyncPayload = {
  state: "idle" | "syncing" | "completed" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  errorMessage: string | null;
  importedMessages: number;
  importedCalls: number;
  importedVoicemails: number;
  isSyncAvailable: boolean;
  unavailableReason: string | null;
  primaryPhoneNumberId: string | null;
  primaryPhoneNumberE164: string | null;
};

export type RecentCallsPayload = {
  items: Array<{
    id: string;
    callSid: string;
    threadId: string;
    eventType: "MISSED_CALL" | "CALL_COMPLETED" | "CALL_DECLINED";
    direction: "INBOUND" | "OUTBOUND";
    title: string;
    externalParticipantE164: string;
    occurredAt: string;
    durationSeconds: number | null;
    providerStatus: string | null;
    errorCode: string | null;
  }>;
};

export function fetchThread(threadId: string) {
  return apiFetch<{
    thread: {
      id: string;
      title: string;
      contactId: string | null;
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

export function markVoicemailHeard(voicemailId: string) {
  return apiFetch<{ ok: true }>(`/api/voicemails/${voicemailId}/heard`, {
    method: "POST",
    headers: {
      "Idempotency-Key": `heard-${voicemailId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
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

export function importContactsCsv(input: {
  rows: Array<{
    displayName: string;
    numbers: string[];
    notes?: string;
  }>;
}) {
  return apiFetch<{
    job: {
      id: string;
      status: string;
      totalRows: number;
      createdCount: number;
      mergedCount: number;
      skippedCount: number;
      errorCount: number;
      completedAt: string | null;
    };
  }>("/api/contact-imports/csv", {
    method: "POST",
    headers: {
      "Idempotency-Key": `csv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
    body: JSON.stringify(input),
  });
}

export function createContact(input: {
  displayName: string;
  notes?: string;
  phoneNumbers: Array<{ e164: string; label?: string }>;
}) {
  return apiFetch<{
    contact: {
      id: string;
      displayName: string;
      notes: string | null;
      phoneNumbers: Array<{ id: string; e164: string; label: string | null }>;
    };
  }>("/api/contacts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateContact(
  contactId: string,
  input: {
    displayName?: string;
    notes?: string | null;
  }
) {
  return apiFetch<{
    contact: {
      id: string;
      displayName: string;
      notes: string | null;
      phoneNumbers: Array<{ id: string; e164: string; label: string | null }>;
    };
  }>(`/api/contacts/${contactId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function fetchSettings() {
  return apiFetch<{
    business: {
      id: string;
      displayName: string | null;
      onboardingState: string;
    };
    voiceRegistrationState: string;
    playbackDefaultsToSpeaker: boolean;
    primaryPhoneNumber: {
      id: string;
      e164: string;
      label: string | null;
    } | null;
    greetings: Array<{
      id: string;
      label: string | null;
      mode: "TTS" | "RECORDED";
      ttsText: string | null;
      audioUrl: string | null;
      isActive: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    featureReadiness: {
      voiceConfigured: boolean;
      voiceUnavailableReason: string | null;
      historySyncAvailable: boolean;
      historySyncUnavailableReason: string | null;
      hasPrimaryPhoneNumber: boolean;
      missingSetupStep: "BUSINESS_PROFILE" | "PHONE_NUMBER" | "GREETING" | null;
    };
  }>("/api/settings/communication");
}

export function fetchHistorySyncStatus() {
  return apiFetch<HistorySyncPayload>("/api/history-sync");
}

export function startHistorySync() {
  return apiFetch<HistorySyncPayload>("/api/history-sync", {
    method: "POST",
  });
}

export function fetchRecentCalls() {
  return apiFetch<RecentCallsPayload>("/api/calls/recent");
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
