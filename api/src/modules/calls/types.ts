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

export type PersistedCallSessionState =
  | "incoming"
  | "answering"
  | "outgoing_dialing"
  | "connecting"
  | "active"
  | "ended"
  | "failed";

export type VoiceRegistrationState = "ready" | "degraded" | "registering";
