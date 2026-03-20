import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { fetchCallSession, fetchHistorySyncStatus, fetchMailbox, fetchRecentCalls, fetchSettings } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import { useCallStore } from "../store/callStore";
import { twilioVoiceService } from "../services/twilioVoice/twilioVoiceService";
import { colors } from "../theme/colors";
import { formatDuration, formatTimestamp } from "../lib/formatters";
import type { RootStackParamList } from "../navigation/types";
import { ApiError } from "../services/api/client";

const heroImage = require("../../assets/adaptive-icon-preview.png");

function voiceCopy(input: {
  voiceRegistrationState: "ready" | "degraded" | "registering";
  callState: string;
  errorMessage: string | null;
}) {
  if (input.callState === "active") {
    return {
      title: "Call in progress",
      description: "Aura is currently connected to an active Twilio voice session.",
      tone: "success" as const,
    };
  }

  if (input.voiceRegistrationState === "ready") {
    return {
      title: "Voice is ready",
      description: "Incoming and outgoing calling is fully registered on this device.",
      tone: "success" as const,
    };
  }

  if (input.voiceRegistrationState === "degraded") {
    return {
      title: "Voice needs attention",
      description: input.errorMessage ?? "This device is signed in, but voice registration is degraded right now.",
      tone: "danger" as const,
    };
  }

  return {
    title: "Finishing voice setup",
    description: "Aura is still registering this device with Twilio voice services.",
    tone: "info" as const,
  };
}

export function DialerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { callState, voiceRegistrationState, externalParticipantE164, lastVoiceErrorCode, lastVoiceErrorMessage } = useCallStore();
  const callSession = useQuery({ queryKey: queryKeys.callSession, queryFn: fetchCallSession });
  const mailbox = useQuery({ queryKey: queryKeys.mailbox, queryFn: fetchMailbox });
  const recentCalls = useQuery({ queryKey: queryKeys.recentCalls, queryFn: fetchRecentCalls });
  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });
  const historySync = useQuery({
    queryKey: queryKeys.historySync,
    queryFn: fetchHistorySyncStatus,
    refetchInterval: (query) => (query.state.data?.state === "syncing" ? 3_000 : false),
  });
  const [number, setNumber] = useState(externalParticipantE164 ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [callErrorMessage, setCallErrorMessage] = useState<string | null>(null);

  const voiceStatus = useMemo(
    () =>
      voiceCopy({
        voiceRegistrationState,
        callState,
        errorMessage: lastVoiceErrorMessage,
      }),
    [callState, lastVoiceErrorMessage, voiceRegistrationState]
  );

  const unheardCount = (mailbox.data?.items ?? []).filter((item) => item.unheard).length;
  const setupStep = settings.data?.featureReadiness.missingSetupStep ?? null;
  const isCallUnavailable =
    settings.isLoading ||
    settings.data?.featureReadiness.hasPrimaryPhoneNumber === false ||
    settings.data?.featureReadiness.voiceConfigured === false;

  async function handleCall() {
    if (!number.trim() || isSubmitting) {
      return;
    }

    try {
      setCallErrorMessage(null);
      setIsSubmitting(true);
      await twilioVoiceService.startOutgoingCall(number.trim());
    } catch (error) {
      setCallErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Aura could not start the call."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={recentCalls.data?.items ?? []}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={recentCalls.isRefetching || mailbox.isRefetching || callSession.isRefetching}
          onRefresh={() => {
            void Promise.all([recentCalls.refetch(), mailbox.refetch(), callSession.refetch(), historySync.refetch()]);
          }}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.heroCard}>
            <Image source={heroImage} style={styles.heroImage} resizeMode="contain" />
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>Aura</Text>
              <Text style={styles.heroTitle}>Phone</Text>
              <Text style={styles.heroDescription}>Dial, check voicemail, and scan recent calls from one place.</Text>
            </View>
          </View>

          <View
            style={[
              styles.voiceCard,
              voiceStatus.tone === "danger"
                ? styles.voiceCardDanger
                : voiceStatus.tone === "success"
                  ? styles.voiceCardSuccess
                  : styles.voiceCardInfo,
            ]}
          >
            <View style={styles.voiceHeader}>
              <Ionicons
                name={voiceStatus.tone === "success" ? "checkmark-circle" : voiceStatus.tone === "danger" ? "warning" : "sync"}
                size={18}
                color={voiceStatus.tone === "danger" ? colors.danger : voiceStatus.tone === "success" ? colors.success : colors.primary}
              />
              <Text style={styles.voiceTitle}>{voiceStatus.title}</Text>
            </View>
            <Text style={styles.voiceDescription}>{voiceStatus.description}</Text>
            <Text style={styles.voiceMeta}>
              Current state: {callState} • Server session: {callSession.data?.session.state ?? "idle"}
            </Text>
            <Text style={styles.voiceMeta}>
              Server voice config: {settings.isLoading ? "checking" : settings.data?.featureReadiness.voiceConfigured ? "ready" : "missing"}
            </Text>
            {lastVoiceErrorCode ? <Text style={styles.voiceError}>Last error: {lastVoiceErrorCode}</Text> : null}
            {settings.data?.featureReadiness.voiceUnavailableReason ? (
              <Text style={styles.voiceError}>{settings.data.featureReadiness.voiceUnavailableReason}</Text>
            ) : null}
          </View>

          {setupStep ? (
            <View style={styles.setupCard}>
              <View style={styles.quickActionHeader}>
                <Ionicons name="construct-outline" size={18} color={colors.primary} />
                <Text style={styles.quickActionTitle}>Finish setup</Text>
              </View>
              <Text style={styles.quickActionBody}>
                {setupStep === "BUSINESS_PROFILE"
                  ? "Add your business name in settings so Aura can finish setup."
                  : setupStep === "PHONE_NUMBER"
                    ? "Your business phone number still needs to be connected."
                    : "Create a voicemail greeting to complete setup."}
              </Text>
            </View>
          ) : null}

          {historySync.data?.state === "syncing" ? (
            <View style={styles.syncBanner}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.syncBannerText}>Importing historical calls and voicemails in the background.</Text>
            </View>
          ) : null}

          <View style={styles.quickActionsRow}>
            <Pressable style={styles.quickActionCard} onPress={() => navigation.navigate("Mailbox")}>
              <View style={styles.quickActionHeader}>
                <Ionicons name="mail-open-outline" size={18} color={colors.voicemail} />
                <Text style={styles.quickActionTitle}>Mailbox</Text>
              </View>
              <Text style={styles.quickActionBody}>
                {unheardCount > 0 ? `${unheardCount} unheard voicemail${unheardCount === 1 ? "" : "s"}` : "Open voicemail inbox"}
              </Text>
            </Pressable>

            <View style={styles.quickActionCard}>
              <View style={styles.quickActionHeader}>
                <Ionicons name="pulse-outline" size={18} color={colors.primary} />
                <Text style={styles.quickActionTitle}>Recent status</Text>
              </View>
              <Text style={styles.quickActionBody}>{voiceRegistrationState === "ready" ? "This device can place and receive calls." : "Calling is still settling."}</Text>
            </View>
          </View>

          <View style={styles.dialCard}>
            <Text style={styles.sectionTitle}>Place a call</Text>
            <TextInput
              value={number}
              onChangeText={setNumber}
              placeholder="+15555550123"
              keyboardType="phone-pad"
              autoCapitalize="none"
              style={styles.numberInput}
              placeholderTextColor={colors.muted}
            />
            <Pressable
              onPress={handleCall}
              disabled={isSubmitting || !number.trim() || isCallUnavailable}
              style={({ pressed }) => [
                styles.callButton,
                (!number.trim() || isSubmitting || isCallUnavailable) && styles.callButtonDisabled,
                pressed && number.trim() && !isSubmitting && !isCallUnavailable ? styles.callButtonPressed : null,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <>
                  <Ionicons name="call" size={18} color={colors.surface} />
                  <Text style={styles.callButtonLabel}>Call number</Text>
                </>
              )}
            </Pressable>
            {callErrorMessage ? <Text style={styles.callError}>{callErrorMessage}</Text> : null}
          </View>

          <Text style={styles.sectionTitle}>Recent calls</Text>
        </View>
      }
      renderItem={({ item }) => {
        const iconName =
          item.eventType === "MISSED_CALL"
            ? "call-outline"
            : item.eventType === "CALL_DECLINED"
              ? "close-circle-outline"
              : "checkmark-done-outline";
        const iconColor =
          item.eventType === "MISSED_CALL"
            ? colors.missedCall
            : item.eventType === "CALL_DECLINED"
              ? colors.danger
              : colors.success;
        return (
          <Pressable
            onPress={() => navigation.navigate("ThreadDetail", { threadId: item.threadId, title: item.title })}
            style={({ pressed }) => [styles.recentCard, pressed && styles.recentCardPressed]}
          >
            <View style={styles.recentLeft}>
              <View style={[styles.recentIconCircle, { backgroundColor: `${iconColor}18` }]}>
                <Ionicons name={iconName} size={18} color={iconColor} />
              </View>
              <View style={styles.recentText}>
                <Text style={styles.recentTitle}>{item.title}</Text>
                <Text style={styles.recentSubtitle}>
                  {item.direction === "INBOUND" ? "Inbound" : "Outbound"} • {item.externalParticipantE164}
                </Text>
              </View>
            </View>
            <View style={styles.recentRight}>
              <Text style={styles.recentTimestamp}>{formatTimestamp(item.occurredAt)}</Text>
              <Text style={styles.recentDuration}>{formatDuration(item.durationSeconds)}</Text>
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        recentCalls.isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingLabel}>Loading recent calls</Text>
          </View>
        ) : (
          <View style={styles.emptyRecents}>
            <Text style={styles.emptyRecentsTitle}>No recent calls yet</Text>
            <Text style={styles.emptyRecentsText}>
              Your completed, missed, and declined calls will appear here once Aura has call activity to show.
            </Text>
          </View>
        )
      }
    />
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
    gap: 12,
  },
  header: {
    gap: 16,
    marginBottom: 4,
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
    width: 68,
    height: 68,
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
  voiceCard: {
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  voiceCardInfo: {
    backgroundColor: "#dbeafe",
  },
  voiceCardSuccess: {
    backgroundColor: "#dcfce7",
  },
  voiceCardDanger: {
    backgroundColor: "#fee2e2",
  },
  voiceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  voiceTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
  },
  voiceDescription: {
    color: colors.text,
    lineHeight: 20,
  },
  voiceMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  voiceError: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  syncBanner: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  syncBannerText: {
    color: colors.text,
    flex: 1,
  },
  setupCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  quickActionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quickActionTitle: {
    color: colors.text,
    fontWeight: "700",
  },
  quickActionBody: {
    color: colors.muted,
    lineHeight: 19,
  },
  dialCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  numberInput: {
    minHeight: 54,
    backgroundColor: "#fbfbfc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    fontSize: 20,
    color: colors.text,
  },
  callButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  callButtonDisabled: {
    opacity: 0.55,
  },
  callButtonPressed: {
    opacity: 0.9,
  },
  callButtonLabel: {
    color: colors.surface,
    fontWeight: "800",
    fontSize: 16,
  },
  callError: {
    color: colors.danger,
    lineHeight: 20,
    fontWeight: "600",
  },
  recentCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  recentCardPressed: {
    opacity: 0.9,
  },
  recentLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  recentIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  recentText: {
    flex: 1,
    gap: 2,
  },
  recentTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  recentSubtitle: {
    color: colors.muted,
    fontSize: 13,
  },
  recentRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  recentTimestamp: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  recentDuration: {
    color: colors.muted,
    fontSize: 12,
  },
  loadingState: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 28,
  },
  loadingLabel: {
    color: colors.muted,
  },
  emptyRecents: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  emptyRecentsTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  emptyRecentsText: {
    color: colors.muted,
    lineHeight: 20,
  },
});
