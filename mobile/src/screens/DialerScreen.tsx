import React, { useState } from "react";
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
import {
  fetchMailbox,
  fetchRecentCalls,
  fetchSettings,
} from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import { useCallStore } from "../store/callStore";
import { twilioVoiceService } from "../services/twilioVoice/twilioVoiceService";
import { colors } from "../theme/colors";
import { formatDuration, formatTimestamp } from "../lib/formatters";
import type { RootStackParamList } from "../navigation/types";
import { ApiError } from "../services/api/client";
import { ReadinessPill } from "../components/ReadinessPill";

const heroImage = require("../../assets/adaptive-icon-preview.png");

export function DialerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { voiceRegistrationState, externalParticipantE164 } = useCallStore();
  const mailbox = useQuery({ queryKey: queryKeys.mailbox, queryFn: fetchMailbox });
  const recentCalls = useQuery({ queryKey: queryKeys.recentCalls, queryFn: fetchRecentCalls });
  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });
  const [number, setNumber] = useState(externalParticipantE164 ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [callErrorMessage, setCallErrorMessage] = useState<string | null>(null);

  const unheardCount = (mailbox.data?.items ?? []).filter((item) => item.unheard).length;
  const isReady =
    !settings.isLoading &&
    voiceRegistrationState === "ready" &&
    settings.data?.featureReadiness.hasPrimaryPhoneNumber === true &&
    settings.data?.featureReadiness.voiceConfigured === true;
  const isCallUnavailable = !isReady;

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
        error instanceof ApiError && error.status >= 400 && error.status < 500
          ? "Aura couldn't start that call. Check the number and try again."
          : "Aura couldn't start the call. Try again in a moment."
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
          refreshing={recentCalls.isRefetching || mailbox.isRefetching || settings.isRefetching}
          onRefresh={() => {
            void Promise.all([recentCalls.refetch(), mailbox.refetch(), settings.refetch()]);
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

          <View style={styles.readinessCard}>
            <ReadinessPill ready={isReady} />
          </View>

          <Pressable style={styles.quickActionCard} onPress={() => navigation.navigate("Mailbox")}>
            <View style={styles.quickActionHeader}>
              <Ionicons name="mail-open-outline" size={18} color={colors.voicemail} />
              <Text style={styles.quickActionTitle}>Mailbox</Text>
            </View>
            <Text style={styles.quickActionBody}>
              {unheardCount > 0 ? `${unheardCount} unheard voicemail${unheardCount === 1 ? "" : "s"}` : "Open voicemail inbox"}
            </Text>
          </Pressable>

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
  readinessCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionCard: {
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
