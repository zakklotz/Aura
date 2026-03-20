import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useClerk } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { fetchHistorySyncStatus, fetchSettings, startHistorySync } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import { useCallStore } from "../store/callStore";
import { colors } from "../theme/colors";
import { formatTimestamp } from "../lib/formatters";
import { BrandedEmptyState } from "../components/BrandedEmptyState";

const heroImage = require("../../assets/approved-original-1024.png");

function voiceSummary(input: {
  voiceRegistrationState: "ready" | "degraded" | "registering";
  callState: string;
  lastVoiceErrorMessage: string | null;
}) {
  if (input.callState === "active") {
    return {
      title: "A call is live right now",
      description: "This device is currently connected to an active call session.",
      tone: "success" as const,
    };
  }

  if (input.voiceRegistrationState === "ready") {
    return {
      title: "Voice is ready",
      description: "Incoming and outgoing calling are registered on this device.",
      tone: "success" as const,
    };
  }

  if (input.voiceRegistrationState === "degraded") {
    return {
      title: "Voice is degraded",
      description: input.lastVoiceErrorMessage ?? "This device can still use the app, but Twilio voice needs attention.",
      tone: "danger" as const,
    };
  }

  return {
    title: "Voice is still settling",
    description: "Aura is finishing device recovery and voice registration in the background.",
    tone: "info" as const,
  };
}

export function SettingsScreen() {
  const { signOut } = useClerk();
  const { callState, voiceRegistrationState, lastVoiceErrorCode, lastVoiceErrorMessage } = useCallStore();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isStartingSync, setIsStartingSync] = useState(false);
  const settingsQuery = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });
  const historySyncQuery = useQuery({ queryKey: queryKeys.historySync, queryFn: fetchHistorySyncStatus });

  const voiceCard = useMemo(
    () =>
      voiceSummary({
        voiceRegistrationState,
        callState,
        lastVoiceErrorMessage,
      }),
    [callState, lastVoiceErrorMessage, voiceRegistrationState]
  );

  async function handleSignOut() {
    try {
      setIsSigningOut(true);
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleStartSync() {
    try {
      setIsStartingSync(true);
      await startHistorySync();
      await historySyncQuery.refetch();
    } finally {
      setIsStartingSync(false);
    }
  }

  const data = settingsQuery.data;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={settingsQuery.isRefetching || historySyncQuery.isRefetching}
          onRefresh={() => {
            void Promise.all([settingsQuery.refetch(), historySyncQuery.refetch()]);
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.heroCard}>
        <Image source={heroImage} style={styles.heroImage} resizeMode="contain" />
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>Aura</Text>
          <Text style={styles.heroTitle}>Settings</Text>
          <Text style={styles.heroDescription}>
            See your business number, active greeting, sync status, and current voice readiness in one place.
          </Text>
        </View>
      </View>

      {settingsQuery.isLoading && !data ? (
        <BrandedEmptyState
          title="Loading settings"
          description="We&apos;re pulling your communication settings and business summary."
        />
      ) : null}

      {data ? (
        <>
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="business-outline" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Business</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Name</Text>
              <Text style={styles.rowValue}>{data.business.displayName ?? "Business name not set"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Setup state</Text>
              <Text style={styles.rowValue}>{data.business.onboardingState.replaceAll("_", " ")}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Primary number</Text>
              <Text style={styles.rowValue}>
                {data.primaryPhoneNumber
                  ? `${data.primaryPhoneNumber.e164}${data.primaryPhoneNumber.label ? ` • ${data.primaryPhoneNumber.label}` : ""}`
                  : "No primary number assigned yet"}
              </Text>
            </View>
          </View>

          {data.featureReadiness.missingSetupStep || !data.featureReadiness.voiceConfigured ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="construct-outline" size={18} color={colors.primary} />
                <Text style={styles.sectionTitle}>Setup checklist</Text>
              </View>
              <View style={styles.checklistRow}>
                <Ionicons
                  name={data.business.displayName ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={data.business.displayName ? colors.success : colors.muted}
                />
                <Text style={styles.checklistCopy}>Business profile {data.business.displayName ? "is set" : "still needs a display name"}</Text>
              </View>
              <View style={styles.checklistRow}>
                <Ionicons
                  name={data.featureReadiness.hasPrimaryPhoneNumber ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={data.featureReadiness.hasPrimaryPhoneNumber ? colors.success : colors.muted}
                />
                <Text style={styles.checklistCopy}>
                  {data.featureReadiness.hasPrimaryPhoneNumber
                    ? "Business phone number is connected"
                    : "Business phone number is still missing"}
                </Text>
              </View>
              <View style={styles.checklistRow}>
                <Ionicons
                  name={data.greetings.length ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={data.greetings.length ? colors.success : colors.muted}
                />
                <Text style={styles.checklistCopy}>
                  {data.greetings.length ? "Voicemail greeting exists" : "Voicemail greeting still needs to be created"}
                </Text>
              </View>
              {data.featureReadiness.voiceUnavailableReason ? (
                <Text style={styles.statusError}>{data.featureReadiness.voiceUnavailableReason}</Text>
              ) : null}
            </View>
          ) : null}

          <View
            style={[
              styles.sectionCard,
              voiceCard.tone === "danger"
                ? styles.statusDanger
                : voiceCard.tone === "success"
                  ? styles.statusSuccess
                  : styles.statusInfo,
            ]}
          >
            <View style={styles.sectionHeader}>
              <Ionicons
                name={voiceCard.tone === "success" ? "checkmark-circle" : voiceCard.tone === "danger" ? "warning" : "sync"}
                size={18}
                color={voiceCard.tone === "danger" ? colors.danger : voiceCard.tone === "success" ? colors.success : colors.primary}
              />
              <Text style={styles.sectionTitle}>{voiceCard.title}</Text>
            </View>
            <Text style={styles.statusDescription}>{voiceCard.description}</Text>
            <Text style={styles.statusMeta}>
              Device status: {voiceRegistrationState} • Call state: {callState}
            </Text>
            <Text style={styles.statusMeta}>
              Server voice config: {data.featureReadiness.voiceConfigured ? "ready" : "missing"}
            </Text>
            {lastVoiceErrorCode ? <Text style={styles.statusError}>Last error: {lastVoiceErrorCode}</Text> : null}
            {data.featureReadiness.voiceUnavailableReason ? <Text style={styles.statusError}>{data.featureReadiness.voiceUnavailableReason}</Text> : null}
            <Text style={styles.statusMeta}>
              Playback defaults to speaker: {data.playbackDefaultsToSpeaker ? "Yes" : "No"}
            </Text>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>History sync</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Status</Text>
              <Text style={styles.rowValue}>{historySyncQuery.data?.state ?? "idle"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Last import</Text>
              <Text style={styles.rowValue}>
                {historySyncQuery.data?.lastSuccessfulSyncAt
                  ? formatTimestamp(historySyncQuery.data.lastSuccessfulSyncAt)
                  : "No completed sync yet"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Imported totals</Text>
              <Text style={styles.rowValue}>
                {historySyncQuery.data
                  ? `${historySyncQuery.data.importedMessages} texts • ${historySyncQuery.data.importedCalls} calls • ${historySyncQuery.data.importedVoicemails} voicemails`
                  : "No sync data yet"}
              </Text>
            </View>
            {historySyncQuery.data?.errorMessage ? (
              <Text style={styles.statusError}>{historySyncQuery.data.errorMessage}</Text>
            ) : null}
            {data.featureReadiness.historySyncUnavailableReason ? (
              <Text style={styles.statusError}>{data.featureReadiness.historySyncUnavailableReason}</Text>
            ) : null}
            {historySyncQuery.data?.isSyncAvailable ? (
              <Pressable onPress={handleStartSync} style={styles.syncButton} disabled={isStartingSync || historySyncQuery.data.state === "syncing"}>
                {isStartingSync || historySyncQuery.data.state === "syncing" ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <>
                    <Ionicons name="cloud-download-outline" size={18} color={colors.surface} />
                    <Text style={styles.syncButtonLabel}>Sync now</Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="mic-outline" size={18} color={colors.voicemail} />
              <Text style={styles.sectionTitle}>Voicemail greetings</Text>
            </View>
            {data.greetings.length ? (
              data.greetings.map((greeting) => (
                <View key={greeting.id} style={styles.greetingRow}>
                  <View style={styles.greetingCopy}>
                    <Text style={styles.greetingTitle}>{greeting.label ?? "Untitled greeting"}</Text>
                    <Text style={styles.greetingMeta}>
                      {greeting.mode === "TTS" ? "Text-to-speech" : "Recorded"} • Updated {formatTimestamp(greeting.updatedAt)}
                    </Text>
                    <Text numberOfLines={2} style={styles.greetingPreview}>
                      {greeting.mode === "TTS"
                        ? greeting.ttsText ?? "No text content"
                        : greeting.audioUrl
                          ? "Recorded greeting is uploaded and ready."
                          : "Recorded greeting file is missing."}
                    </Text>
                  </View>
                  {greeting.isActive ? (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeLabel}>Active</Text>
                    </View>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.emptyCopy}>No greetings yet. Add one during business setup or from the API settings routes.</Text>
            )}
          </View>

          <Pressable onPress={handleSignOut} style={styles.signOutButton} disabled={isSigningOut}>
            {isSigningOut ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={18} color={colors.surface} />
                <Text style={styles.signOutLabel}>Sign out</Text>
              </>
            )}
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 16,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  heroImage: {
    width: 72,
    height: 72,
    borderRadius: 20,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroEyebrow: {
    color: colors.primary,
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: 12,
    letterSpacing: 1.3,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
  },
  heroDescription: {
    color: colors.muted,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  row: {
    gap: 4,
  },
  rowLabel: {
    color: colors.muted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  rowValue: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checklistCopy: {
    color: colors.text,
    flex: 1,
    lineHeight: 20,
  },
  statusInfo: {
    backgroundColor: "#dbeafe",
  },
  statusSuccess: {
    backgroundColor: "#dcfce7",
  },
  statusDanger: {
    backgroundColor: "#fee2e2",
  },
  statusDescription: {
    color: colors.text,
    lineHeight: 20,
  },
  statusMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  statusError: {
    color: colors.danger,
    fontWeight: "700",
    lineHeight: 20,
  },
  greetingRow: {
    borderRadius: 16,
    backgroundColor: "#fafbfc",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  greetingCopy: {
    flex: 1,
    gap: 4,
  },
  greetingTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  greetingMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  greetingPreview: {
    color: colors.text,
    lineHeight: 19,
  },
  activeBadge: {
    backgroundColor: "#dcfce7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeBadgeLabel: {
    color: colors.success,
    fontWeight: "800",
    fontSize: 12,
  },
  emptyCopy: {
    color: colors.muted,
    lineHeight: 20,
  },
  syncButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  syncButtonLabel: {
    color: colors.surface,
    fontWeight: "800",
  },
  signOutButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  signOutLabel: {
    color: colors.surface,
    fontWeight: "800",
    fontSize: 16,
  },
});
