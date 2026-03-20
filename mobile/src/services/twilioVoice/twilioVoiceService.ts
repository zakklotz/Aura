import { Platform } from "react-native";
import type { QueryClient } from "@tanstack/react-query";
import { Call, CallInvite, CallKit, Voice } from "@twilio/voice-react-native-sdk";
import {
  createOutboundSession,
  fetchCallSession,
  fetchVoiceAccessToken,
  postCallSessionEvent,
  registerDevice,
  unregisterDevice,
  type BootstrapPayload,
} from "../api/softphoneApi";
import { getOrCreateDeviceId } from "../device/deviceIdentity";
import { queryKeys } from "../../store/queryKeys";
import { useCallStore } from "../../store/callStore";

type BootstrapContext = {
  isSignedIn: boolean;
  bootstrap: BootstrapPayload | null | undefined;
  queryClient: QueryClient;
};

type NormalizedVoiceError = {
  code: string | null;
  message: string | null;
};

const ACTIVE_CALL_STATES = new Set(["incoming", "answering", "outgoing_dialing", "connecting", "active"]);
const RECOVERY_TIMEOUT_MS = 3_000;
const REGISTRATION_TIMEOUT_MS = 8_000;

function toLocalVoiceRegistrationState(state: "READY" | "DEGRADED" | "REGISTERING" | null | undefined) {
  switch (state) {
    case "READY":
      return "ready" as const;
    case "DEGRADED":
      return "degraded" as const;
    default:
      return "registering" as const;
  }
}

function normalizeTwilioError(error: unknown, fallbackCode: string): NormalizedVoiceError {
  if (error && typeof error === "object") {
    const maybeMessage = "message" in error && typeof error.message === "string" ? error.message : null;
    const maybeCode = "code" in error && typeof error.code === "number" ? `${fallbackCode}:${error.code}` : fallbackCode;
    return {
      code: fallbackCode,
      message: maybeMessage ?? maybeCode,
    };
  }

  return {
    code: fallbackCode,
    message: error instanceof Error ? error.message : fallbackCode,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    delay(timeoutMs).then(() => {
      throw new Error(message);
    }),
  ]);
}

function readInviteUuid(invite: CallInvite): string | null {
  const candidate = invite as unknown as { _uuid?: string };
  return typeof candidate._uuid === "string" ? candidate._uuid : null;
}

function mapRecoveredCallState(call: Call): "connecting" | "active" | "ended" {
  const state = call.getState();
  if (state === Call.State.Connected) {
    return "active";
  }
  if (state === Call.State.Disconnected) {
    return "ended";
  }
  return "connecting";
}

class TwilioVoiceService {
  private voice: Voice | null = null;
  private queryClient: QueryClient | null = null;
  private bootstrapPromise: Promise<void> | null = null;
  private registrationPromise: Promise<void> | null = null;
  private unregisterPromise: Promise<void> | null = null;
  private refreshPromise: Promise<void> | null = null;
  private recoveryPromise: Promise<void> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private currentToken: string | null = null;
  private currentIdentity: string | null = null;
  private currentDeviceId: string | null = null;
  private currentBusinessId: string | null = null;
  private currentPrimaryPhoneNumberId: string | null = null;
  private currentInvite: CallInvite | null = null;
  private currentCall: Call | null = null;
  private listenersBound = false;

  async bootstrap(context: BootstrapContext) {
    if (!context.isSignedIn || !context.bootstrap?.business) {
      await this.teardown();
      return;
    }

    this.queryClient = context.queryClient;

    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }

    this.bootstrapPromise = this.bootstrapInternal(context).finally(() => {
      this.bootstrapPromise = null;
    });
    return this.bootstrapPromise;
  }

  async handleAppActive() {
    if (!this.currentBusinessId) {
      return;
    }

    const refreshAfter = useCallStore.getState().tokenRefreshAfter;
    if (refreshAfter && new Date(refreshAfter).getTime() <= Date.now()) {
      await this.refreshRegistration();
    }

    await this.recoverWithTimeout();
  }

  async startOutgoingCall(to: string) {
    const businessId = this.currentBusinessId;
    const phoneNumberId = this.currentPrimaryPhoneNumberId;
    if (!businessId || !phoneNumberId) {
      throw new Error("No active business number is configured");
    }

    await this.ensureRegistered();

    const occurredAt = new Date().toISOString();
    const outbound = await createOutboundSession({ to, phoneNumberId });
    useCallStore.getState().setCallSession({
      direction: "outbound",
      phoneNumberId: outbound.phoneNumberId,
      externalParticipantE164: outbound.externalParticipantE164,
    });
    useCallStore.getState().setCallState("outgoing_dialing");

    await postCallSessionEvent({
      state: "outgoing_dialing",
      occurredAt,
      direction: "outbound",
      phoneNumberId: outbound.phoneNumberId,
      externalParticipantE164: outbound.externalParticipantE164,
    });

    try {
      const token = await this.ensureAccessToken();
      const call = await this.getVoice().connect(token, {
        contactHandle: outbound.externalParticipantE164,
        notificationDisplayName: outbound.externalParticipantE164,
        params: {
          To: outbound.externalParticipantE164,
        },
      });
      this.currentCall = call;
      this.attachCallListeners(call, "outbound");
      useCallStore.getState().setCallSession({
        callSid: call.getSid() ?? null,
        direction: "outbound",
        phoneNumberId: outbound.phoneNumberId,
        externalParticipantE164: outbound.externalParticipantE164,
      });
      useCallStore.getState().setCallState("connecting");
      await postCallSessionEvent({
        state: "connecting",
        occurredAt: new Date().toISOString(),
        callSid: call.getSid() ?? null,
        direction: "outbound",
        phoneNumberId: outbound.phoneNumberId,
        externalParticipantE164: outbound.externalParticipantE164,
      });
      this.invalidateCallSession();
    } catch (error) {
      const normalized = normalizeTwilioError(error, "CALL_CONNECT_ERROR");
      useCallStore.getState().setVoiceError(normalized);
      useCallStore.getState().setCallState("failed");
      await postCallSessionEvent({
        state: "failed",
        occurredAt: new Date().toISOString(),
        direction: "outbound",
        phoneNumberId: outbound.phoneNumberId,
        externalParticipantE164: outbound.externalParticipantE164,
        errorCode: normalized.code,
        errorMessage: normalized.message,
      });
      this.scheduleReadySettle();
      throw error;
    }
  }

  async acceptIncomingCall() {
    if (!this.currentInvite) {
      return;
    }

    const invite = this.currentInvite;
    const callSid = invite.getCallSid();
    const externalParticipantE164 = invite.getFrom();
    useCallStore.getState().setCallState("answering");
    await postCallSessionEvent({
      state: "answering",
      occurredAt: new Date().toISOString(),
      callSid,
      direction: "inbound",
      phoneNumberId: this.currentPrimaryPhoneNumberId,
      externalParticipantE164,
    });

    const call = await invite.accept();
    this.currentInvite = null;
    useCallStore.getState().setPendingInviteUuid(null);
    this.currentCall = call;
    this.attachCallListeners(call, "inbound");
    useCallStore.getState().setCallSession({
      callSid: call.getSid() ?? callSid ?? null,
      direction: "inbound",
      phoneNumberId: this.currentPrimaryPhoneNumberId,
      externalParticipantE164,
    });
    useCallStore.getState().setCallState("connecting");
    await postCallSessionEvent({
      state: "connecting",
      occurredAt: new Date().toISOString(),
      callSid: call.getSid() ?? callSid ?? null,
      direction: "inbound",
      phoneNumberId: this.currentPrimaryPhoneNumberId,
      externalParticipantE164,
    });
    this.invalidateCallSession();
  }

  async rejectIncomingCall() {
    if (!this.currentInvite) {
      return;
    }

    const invite = this.currentInvite;
    const callSid = invite.getCallSid();
    const externalParticipantE164 = invite.getFrom();
    await invite.reject();
    this.currentInvite = null;
    useCallStore.getState().setPendingInviteUuid(null);
    useCallStore.getState().setCallState("ended");
    await postCallSessionEvent({
      state: "ended",
      occurredAt: new Date().toISOString(),
      callSid,
      direction: "inbound",
      phoneNumberId: this.currentPrimaryPhoneNumberId,
      externalParticipantE164,
    });
    this.scheduleReadySettle();
    this.invalidateCallSession();
  }

  async disconnectActiveCall() {
    if (!this.currentCall) {
      return;
    }

    const call = this.currentCall;
    const callSid = call.getSid() ?? useCallStore.getState().callSid;
    const externalParticipantE164 = useCallStore.getState().externalParticipantE164;
    await call.disconnect();
    this.currentCall = null;
    useCallStore.getState().setCallState("ended");
    await postCallSessionEvent({
      state: "ended",
      occurredAt: new Date().toISOString(),
      callSid,
      direction: useCallStore.getState().direction,
      phoneNumberId: useCallStore.getState().phoneNumberId,
      externalParticipantE164,
    });
    this.scheduleReadySettle();
    this.invalidateCallSession();
  }

  private async bootstrapInternal(context: BootstrapContext) {
    const bootstrap = context.bootstrap!;
    const store = useCallStore.getState();
    const previousBusinessId = this.currentBusinessId;
    const previousDeviceId = this.currentDeviceId;
    store.setDeviceId(bootstrap.device.deviceId ?? null);
    store.setVoiceRegistrationState(toLocalVoiceRegistrationState(bootstrap.device.voiceRegistrationState));
    store.setVoiceError({
      code: bootstrap.device.lastRegistrationErrorCode ?? null,
      message: bootstrap.device.lastRegistrationErrorMessage ?? null,
    });

    this.currentBusinessId = bootstrap.business?.id ?? null;
    this.currentPrimaryPhoneNumberId = bootstrap.primaryPhoneNumber?.id ?? null;
    this.currentIdentity =
      bootstrap.device.twilioIdentity ??
      (bootstrap.business ? `business_${bootstrap.business.id}_user_${bootstrap.user.id}` : null);
    this.currentDeviceId = bootstrap.device.deviceId ?? (await getOrCreateDeviceId());

    await this.ensureNativeSetup();
    await this.recoverWithTimeout();

    const refreshAfter = store.tokenRefreshAfter;
    const tokenExpiresAt = store.tokenExpiresAt;
    const tokenStillFresh = Boolean(
      this.currentToken &&
        ((refreshAfter && new Date(refreshAfter).getTime() > Date.now()) ||
          (tokenExpiresAt && new Date(tokenExpiresAt).getTime() > Date.now()))
    );
    const sameVoiceContext =
      previousBusinessId === this.currentBusinessId && previousDeviceId === this.currentDeviceId;
    if (sameVoiceContext && tokenStillFresh && store.voiceRegistrationState === "ready") {
      return;
    }

    await this.ensureRegistered();
  }

  private getVoice(): Voice {
    if (!this.voice) {
      this.voice = new Voice();
    }
    return this.voice;
  }

  private async ensureNativeSetup() {
    const voice = this.getVoice();
    if (!this.listenersBound) {
      voice.addListener(Voice.Event.CallInvite, (callInvite: CallInvite) => {
        void this.handleIncomingInvite(callInvite);
      });
      voice.on(Voice.Event.Registered, () => {
        useCallStore.getState().setVoiceRegistrationState("ready");
        useCallStore.getState().setVoiceError({ code: null, message: null });
        if (!ACTIVE_CALL_STATES.has(useCallStore.getState().callState)) {
          useCallStore.getState().setCallState("ready");
        }
      });
      voice.on(Voice.Event.Unregistered, () => {
        if (!ACTIVE_CALL_STATES.has(useCallStore.getState().callState)) {
          useCallStore.getState().setCallState("idle");
        }
      });
      voice.on(Voice.Event.Error, (error) => {
        const normalized = normalizeTwilioError(error, "VOICE_REGISTRATION_ERROR");
        useCallStore.getState().setVoiceRegistrationState("degraded");
        useCallStore.getState().setVoiceError(normalized);
        void this.persistDeviceState({
          voiceRegistrationState: "DEGRADED",
          twilioIdentity: this.currentIdentity,
          lastRegistrationErrorCode: normalized.code,
          lastRegistrationErrorMessage: normalized.message,
        });
        if (!ACTIVE_CALL_STATES.has(useCallStore.getState().callState)) {
          useCallStore.getState().setCallState("failed");
          this.scheduleReadySettle();
        }
      });
      this.listenersBound = true;
    }

    if (Platform.OS === "ios") {
      await voice.initializePushRegistry();
      await voice.setCallKitConfiguration({
        callKitIconTemplateImageData: "",
        callKitIncludesCallsInRecents: false,
        callKitMaximumCallGroups: 1,
        callKitMaximumCallsPerCallGroup: 1,
        callKitRingtoneSound: "",
        callKitSupportedHandleTypes: [CallKit.HandleType.PhoneNumber],
      });
    }
  }

  private async ensureRegistered() {
    if (!this.currentBusinessId || !this.currentIdentity) {
      return;
    }

    if (this.registrationPromise) {
      return this.registrationPromise;
    }

    this.registrationPromise = this.performRegister().finally(() => {
      this.registrationPromise = null;
    });
    return this.registrationPromise;
  }

  private async performRegister() {
    const store = useCallStore.getState();
    const deviceId = this.currentDeviceId ?? (await getOrCreateDeviceId());
    this.currentDeviceId = deviceId;
    store.setDeviceId(deviceId);
    store.setVoiceRegistrationState("registering");
    store.setVoiceError({ code: null, message: null });
    if (store.callState === "idle" || store.callState === "failed") {
      store.setCallState("registering");
    }

    await this.persistDeviceState({
      voiceRegistrationState: "REGISTERING",
      twilioIdentity: this.currentIdentity,
    });

    try {
      const tokenPayload = await fetchVoiceAccessToken();
      this.currentToken = tokenPayload.token;
      this.currentIdentity = tokenPayload.identity;
      store.setTokenLifecycle({
        issuedAt: tokenPayload.issuedAt,
        expiresAt: tokenPayload.expiresAt,
        refreshAfter: tokenPayload.refreshAfter,
      });

      await withTimeout(
        this.getVoice().register(tokenPayload.token),
        REGISTRATION_TIMEOUT_MS,
        "Voice registration timed out while registering this device."
      );
      const voicePushToken = await this.safeGetVoicePushToken();
      await this.persistDeviceState({
        voiceRegistrationState: "READY",
        voicePushToken,
        twilioIdentity: tokenPayload.identity,
      });

      store.setVoiceRegistrationState("ready");
      store.setVoiceError({ code: null, message: null });
      if (!ACTIVE_CALL_STATES.has(store.callState)) {
        store.setCallState("ready");
      }
      this.scheduleRefresh(tokenPayload.refreshAfter);
    } catch (error) {
      const normalized = normalizeTwilioError(error, "VOICE_REGISTRATION_ERROR");
      store.setVoiceRegistrationState("degraded");
      store.setVoiceError(normalized);
      store.setCallState("failed");
      await this.persistDeviceState({
        voiceRegistrationState: "DEGRADED",
        twilioIdentity: this.currentIdentity,
        lastRegistrationErrorCode: normalized.code,
        lastRegistrationErrorMessage: normalized.message,
      });
      this.scheduleReadySettle();
    }
  }

  private async refreshRegistration() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async performRefresh() {
    const store = useCallStore.getState();
    try {
      const previousToken = this.currentToken;
      const tokenPayload = await fetchVoiceAccessToken();
      this.currentToken = tokenPayload.token;
      this.currentIdentity = tokenPayload.identity;
      store.setTokenLifecycle({
        issuedAt: tokenPayload.issuedAt,
        expiresAt: tokenPayload.expiresAt,
        refreshAfter: tokenPayload.refreshAfter,
      });

      try {
        await withTimeout(
          this.getVoice().register(tokenPayload.token),
          REGISTRATION_TIMEOUT_MS,
          "Voice registration timed out while refreshing this device."
        );
      } catch (error) {
        if (previousToken) {
          await this.getVoice().unregister(previousToken).catch(() => undefined);
        }
        await withTimeout(
          this.getVoice().register(tokenPayload.token),
          REGISTRATION_TIMEOUT_MS,
          "Voice registration timed out while retrying this device refresh."
        );
      }

      const voicePushToken = await this.safeGetVoicePushToken();
      await this.persistDeviceState({
        voiceRegistrationState: "READY",
        voicePushToken,
        twilioIdentity: tokenPayload.identity,
      });
      store.setVoiceRegistrationState("ready");
      store.setVoiceError({ code: null, message: null });
      this.scheduleRefresh(tokenPayload.refreshAfter);
    } catch (error) {
      const normalized = normalizeTwilioError(error, "VOICE_TOKEN_ERROR");
      store.setVoiceRegistrationState("degraded");
      store.setVoiceError(normalized);
      await this.persistDeviceState({
        voiceRegistrationState: "DEGRADED",
        twilioIdentity: this.currentIdentity,
        lastRegistrationErrorCode: normalized.code,
        lastRegistrationErrorMessage: normalized.message,
      });
    }
  }

  private scheduleRefresh(refreshAfter: string | null) {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (!refreshAfter) {
      return;
    }

    const delayMs = Math.max(new Date(refreshAfter).getTime() - Date.now(), 1_000);
    this.refreshTimer = setTimeout(() => {
      void this.refreshRegistration();
    }, delayMs);
  }

  private async safeGetVoicePushToken(): Promise<string | undefined> {
    try {
      return await this.getVoice().getDeviceToken();
    } catch {
      return undefined;
    }
  }

  private async persistDeviceState(input: {
    voiceRegistrationState: "READY" | "DEGRADED" | "REGISTERING";
    voicePushToken?: string;
    twilioIdentity?: string | null;
    lastRegistrationErrorCode?: string | null;
    lastRegistrationErrorMessage?: string | null;
  }) {
    const deviceId = this.currentDeviceId ?? (await getOrCreateDeviceId());
    this.currentDeviceId = deviceId;

    await registerDevice({
      deviceId,
      platform: Platform.OS === "ios" ? "IOS" : "ANDROID",
      voicePushToken: input.voicePushToken,
      twilioIdentity: input.twilioIdentity ?? this.currentIdentity ?? undefined,
      voiceRegistrationState: input.voiceRegistrationState,
      lastRegistrationErrorCode: input.lastRegistrationErrorCode ?? undefined,
      lastRegistrationErrorMessage: input.lastRegistrationErrorMessage ?? undefined,
    }).catch(() => undefined);

    this.invalidateBootstrap();
  }

  private async recoverWithTimeout() {
    if (this.recoveryPromise) {
      return this.recoveryPromise;
    }

    this.recoveryPromise = this.performRecoveryWithTimeout().finally(() => {
      this.recoveryPromise = null;
    });
    return this.recoveryPromise;
  }

  private async performRecoveryWithTimeout() {
    const store = useCallStore.getState();
    store.setRecoveryState(true);

    const recovery = this.recoverFromNativeAndServer().finally(() => {
      useCallStore.getState().setRecoveryState(false);
    });

    const timedOut = await Promise.race([
      recovery.then(() => false),
      delay(RECOVERY_TIMEOUT_MS).then(() => true),
    ]);

    if (timedOut) {
      const normalized = {
        code: "VOICE_REGISTRATION_ERROR" as const,
        message: "Voice recovery timed out while the app was starting. Aura will keep trying in the background.",
      };
      store.setVoiceRegistrationState("degraded");
      store.setVoiceError(normalized);
      if (!ACTIVE_CALL_STATES.has(store.callState)) {
        store.setCallState("failed");
        this.scheduleReadySettle();
      }
      void this.persistDeviceState({
        voiceRegistrationState: "DEGRADED",
        twilioIdentity: this.currentIdentity,
        lastRegistrationErrorCode: normalized.code,
        lastRegistrationErrorMessage: normalized.message,
      });
      store.setRecoveryState(false);
      recovery.catch(() => undefined);
    }
  }

  private async recoverFromNativeAndServer() {
    const [serverSession, invitesMap, callsMap] = await Promise.all([
      fetchCallSession().catch(() => null),
      this.getVoice().getCallInvites().catch(() => new Map<string, CallInvite>()),
      this.getVoice().getCalls().catch(() => new Map<string, Call>()),
    ]);

    const liveCall = Array.from(callsMap.values())[0] ?? null;
    if (liveCall) {
      this.currentCall = liveCall;
      this.attachCallListeners(liveCall, useCallStore.getState().direction ?? "outbound");
      const sdkState = mapRecoveredCallState(liveCall);
      const callSid = liveCall.getSid() ?? serverSession?.session.callSid ?? null;
      const externalParticipantE164 = serverSession?.session.externalParticipantE164 ?? liveCall.getTo() ?? liveCall.getFrom() ?? null;
      useCallStore.getState().setCallSession({
        callSid,
        direction: serverSession?.session.direction ?? useCallStore.getState().direction,
        phoneNumberId: serverSession?.session.phoneNumberId ?? this.currentPrimaryPhoneNumberId,
        externalParticipantE164,
      });
      useCallStore.getState().setCallState(sdkState);
      if (!serverSession?.session.callSid || serverSession.session.callSid !== callSid) {
        await postCallSessionEvent({
          state: sdkState,
          occurredAt: new Date().toISOString(),
          callSid,
          direction: useCallStore.getState().direction,
          phoneNumberId: useCallStore.getState().phoneNumberId,
          externalParticipantE164,
        }).catch(() => undefined);
        this.invalidateCallSession();
      }
      return;
    }

    const liveInvite = Array.from(invitesMap.values())[0] ?? null;
    if (liveInvite) {
      await this.handleIncomingInvite(liveInvite);
      if (!serverSession?.session.callSid || serverSession.session.callSid !== liveInvite.getCallSid()) {
        await postCallSessionEvent({
          state: "incoming",
          occurredAt: new Date().toISOString(),
          callSid: liveInvite.getCallSid(),
          direction: "inbound",
          phoneNumberId: this.currentPrimaryPhoneNumberId,
          externalParticipantE164: liveInvite.getFrom(),
        }).catch(() => undefined);
        this.invalidateCallSession();
      }
      return;
    }

    if (serverSession?.session && ACTIVE_CALL_STATES.has(serverSession.session.state)) {
      useCallStore.getState().setCallSession({
        callSid: serverSession.session.callSid,
        direction: serverSession.session.direction,
        phoneNumberId: serverSession.session.phoneNumberId,
        externalParticipantE164: serverSession.session.externalParticipantE164,
      });
      useCallStore.getState().setCallState(serverSession.session.state);
    }
  }

  private async handleIncomingInvite(callInvite: CallInvite) {
    this.currentInvite = callInvite;
    const callSid = callInvite.getCallSid();
    const externalParticipantE164 = callInvite.getFrom();
    const inviteUuid = readInviteUuid(callInvite);
    useCallStore.getState().setPendingInviteUuid(inviteUuid);
    useCallStore.getState().setCallSession({
      callSid,
      direction: "inbound",
      phoneNumberId: this.currentPrimaryPhoneNumberId,
      externalParticipantE164,
    });
    useCallStore.getState().setCallState("incoming");

    callInvite.on(CallInvite.Event.Accepted, (call) => {
      this.currentInvite = null;
      useCallStore.getState().setPendingInviteUuid(null);
      this.currentCall = call;
      this.attachCallListeners(call, "inbound");
      useCallStore.getState().setCallSession({
        callSid: call.getSid() ?? callSid ?? null,
        direction: "inbound",
        phoneNumberId: this.currentPrimaryPhoneNumberId,
        externalParticipantE164,
      });
      useCallStore.getState().setCallState("connecting");
      void postCallSessionEvent({
        state: "connecting",
        occurredAt: new Date().toISOString(),
        callSid: call.getSid() ?? callSid ?? null,
        direction: "inbound",
        phoneNumberId: this.currentPrimaryPhoneNumberId,
        externalParticipantE164,
      });
      this.invalidateCallSession();
    });
    callInvite.on(CallInvite.Event.Rejected, () => {
      this.currentInvite = null;
      useCallStore.getState().setPendingInviteUuid(null);
      useCallStore.getState().setCallState("ended");
      void postCallSessionEvent({
        state: "ended",
        occurredAt: new Date().toISOString(),
        callSid,
        direction: "inbound",
        phoneNumberId: this.currentPrimaryPhoneNumberId,
        externalParticipantE164,
      });
      this.scheduleReadySettle();
      this.invalidateCallSession();
    });
    callInvite.on(CallInvite.Event.Cancelled, (error) => {
      this.currentInvite = null;
      useCallStore.getState().setPendingInviteUuid(null);
      const normalized = normalizeTwilioError(error, "CALL_CONNECT_ERROR");
      useCallStore.getState().setVoiceError(normalized);
      useCallStore.getState().setCallState("failed");
      void postCallSessionEvent({
        state: "failed",
        occurredAt: new Date().toISOString(),
        callSid,
        direction: "inbound",
        phoneNumberId: this.currentPrimaryPhoneNumberId,
        externalParticipantE164,
        errorCode: normalized.code,
        errorMessage: normalized.message,
      });
      this.scheduleReadySettle();
      this.invalidateCallSession();
    });
    callInvite.on(CallInvite.Event.NotificationTapped, () => {
      useCallStore.getState().setCallState("incoming");
      this.invalidateCallSession();
    });

    await postCallSessionEvent({
      state: "incoming",
      occurredAt: new Date().toISOString(),
      callSid,
      direction: "inbound",
      phoneNumberId: this.currentPrimaryPhoneNumberId,
      externalParticipantE164,
    }).catch(() => undefined);
    this.invalidateCallSession();
  }

  private attachCallListeners(call: Call, direction: "inbound" | "outbound") {
    call.on(Call.Event.Ringing, () => {
      useCallStore.getState().setCallState("connecting");
      useCallStore.getState().setCallSession({
        callSid: call.getSid() ?? useCallStore.getState().callSid,
        direction,
        externalParticipantE164: useCallStore.getState().externalParticipantE164,
      });
      void postCallSessionEvent({
        state: "connecting",
        occurredAt: new Date().toISOString(),
        callSid: call.getSid() ?? useCallStore.getState().callSid,
        direction,
        phoneNumberId: useCallStore.getState().phoneNumberId,
        externalParticipantE164: useCallStore.getState().externalParticipantE164,
      });
      this.invalidateCallSession();
    });

    call.on(Call.Event.Connected, () => {
      const externalParticipantE164 =
        useCallStore.getState().externalParticipantE164 ??
        (direction === "outbound" ? call.getTo() : call.getFrom()) ??
        null;
      useCallStore.getState().setCallSession({
        callSid: call.getSid() ?? useCallStore.getState().callSid,
        direction,
        phoneNumberId: useCallStore.getState().phoneNumberId ?? this.currentPrimaryPhoneNumberId,
        externalParticipantE164,
      });
      useCallStore.getState().setCallState("active");
      void postCallSessionEvent({
        state: "active",
        occurredAt: new Date().toISOString(),
        callSid: call.getSid() ?? useCallStore.getState().callSid,
        direction,
        phoneNumberId: useCallStore.getState().phoneNumberId,
        externalParticipantE164,
      });
      this.invalidateCallSession();
    });

    call.on(Call.Event.ConnectFailure, (error) => {
      const normalized = normalizeTwilioError(error, "CALL_CONNECT_ERROR");
      useCallStore.getState().setVoiceError(normalized);
      useCallStore.getState().setCallState("failed");
      void postCallSessionEvent({
        state: "failed",
        occurredAt: new Date().toISOString(),
        callSid: call.getSid() ?? useCallStore.getState().callSid,
        direction,
        phoneNumberId: useCallStore.getState().phoneNumberId,
        externalParticipantE164: useCallStore.getState().externalParticipantE164,
        errorCode: normalized.code,
        errorMessage: normalized.message,
      });
      this.currentCall = null;
      this.scheduleReadySettle();
      this.invalidateCallSession();
    });

    call.on(Call.Event.Disconnected, (error) => {
      const normalized = error ? normalizeTwilioError(error, "CALL_CONNECT_ERROR") : null;
      if (normalized) {
        useCallStore.getState().setVoiceError(normalized);
      }
      useCallStore.getState().setCallState(normalized ? "failed" : "ended");
      void postCallSessionEvent({
        state: normalized ? "failed" : "ended",
        occurredAt: new Date().toISOString(),
        callSid: call.getSid() ?? useCallStore.getState().callSid,
        direction,
        phoneNumberId: useCallStore.getState().phoneNumberId,
        externalParticipantE164: useCallStore.getState().externalParticipantE164,
        errorCode: normalized?.code ?? null,
        errorMessage: normalized?.message ?? null,
      });
      this.currentCall = null;
      this.scheduleReadySettle();
      this.invalidateCallSession();
    });
  }

  private scheduleReadySettle() {
    setTimeout(() => {
      const store = useCallStore.getState();
      if (ACTIVE_CALL_STATES.has(store.callState)) {
        return;
      }
      store.setCallSession({
        callSid: null,
        direction: null,
        phoneNumberId: null,
        externalParticipantE164: null,
      });
      store.setCallState(store.voiceRegistrationState === "ready" ? "ready" : "idle");
    }, 1_500);
  }

  private invalidateBootstrap() {
    this.queryClient?.invalidateQueries({ queryKey: queryKeys.bootstrap });
  }

  private invalidateCallSession() {
    this.queryClient?.invalidateQueries({ queryKey: queryKeys.callSession });
  }

  async teardown() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.unregisterPromise) {
      return this.unregisterPromise;
    }

    const currentToken = this.currentToken;
    const currentDeviceId = this.currentDeviceId;
    this.unregisterPromise = (async () => {
      try {
        if (currentToken) {
          await this.getVoice().unregister(currentToken).catch(() => undefined);
        }
        if (currentDeviceId) {
          await unregisterDevice(currentDeviceId).catch(() => undefined);
        }
      } finally {
        this.currentToken = null;
        this.currentIdentity = null;
        this.currentBusinessId = null;
        this.currentPrimaryPhoneNumberId = null;
        this.currentInvite = null;
        this.currentCall = null;
        useCallStore.getState().resetVoiceState();
        useCallStore.getState().setDeviceId(currentDeviceId ?? null);
        this.unregisterPromise = null;
      }
    })();
    return this.unregisterPromise;
  }

  private async ensureAccessToken(): Promise<string> {
    const refreshAfter = useCallStore.getState().tokenRefreshAfter;
    if (!this.currentToken || (refreshAfter && new Date(refreshAfter).getTime() <= Date.now())) {
      await this.refreshRegistration();
    }

    if (!this.currentToken) {
      const tokenPayload = await fetchVoiceAccessToken();
      this.currentToken = tokenPayload.token;
      this.currentIdentity = tokenPayload.identity;
      useCallStore.getState().setTokenLifecycle({
        issuedAt: tokenPayload.issuedAt,
        expiresAt: tokenPayload.expiresAt,
        refreshAfter: tokenPayload.refreshAfter,
      });
    }

    return this.currentToken;
  }
}

export const twilioVoiceService = new TwilioVoiceService();
