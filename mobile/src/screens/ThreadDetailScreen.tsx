import React, { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fetchThread, markThreadRead } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import { formatDuration, formatTimestamp } from "../lib/formatters";
import { BrandedEmptyState } from "../components/BrandedEmptyState";

type ThreadItemPayload =
  | {
      body?: string | null;
      direction?: "INBOUND" | "OUTBOUND";
      deliveryStatus?: string | null;
      providerStatus?: string | null;
      errorCode?: string | null;
    }
  | {
      eventType?: "MISSED_CALL" | "CALL_COMPLETED" | "CALL_DECLINED";
      direction?: "INBOUND" | "OUTBOUND";
      durationSeconds?: number | null;
      providerStatus?: string | null;
      errorCode?: string | null;
    }
  | {
      durationSeconds?: number | null;
      transcriptStatus?: string | null;
      transcriptText?: string | null;
      recordingUrl?: string | null;
    }
  | null;

function callCopy(eventType: string | undefined) {
  switch (eventType) {
    case "MISSED_CALL":
      return {
        icon: "call-outline" as const,
        color: colors.missedCall,
        title: "Missed call",
      };
    case "CALL_DECLINED":
      return {
        icon: "close-circle-outline" as const,
        color: colors.danger,
        title: "Declined call",
      };
    default:
      return {
        icon: "checkmark-circle-outline" as const,
        color: colors.success,
        title: "Completed call",
      };
  }
}

export function ThreadDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "ThreadDetail">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const threadId = route.params.threadId;
  const query = useQuery({
    queryKey: queryKeys.thread(threadId),
    queryFn: () => fetchThread(threadId),
  });

  useEffect(() => {
    markThreadRead(threadId)
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
          queryClient.invalidateQueries({ queryKey: queryKeys.thread(threadId) }),
        ])
      )
      .catch(() => undefined);
  }, [queryClient, threadId]);

  const thread = query.data?.thread;
  const showSaveContactButton = Boolean(thread && !thread.contactId && thread.externalParticipantE164);

  const threadSubtitle = useMemo(() => {
    if (!thread) {
      return route.params.title;
    }

    return thread.contactId ? thread.externalParticipantE164 : `${thread.externalParticipantE164} • Unknown contact`;
  }, [route.params.title, thread]);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={query.data?.items ?? []}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}
      renderItem={({ item }) => {
        const payload = (item.payload as ThreadItemPayload) ?? null;

        if (item.itemType === "SMS_INBOUND" || item.itemType === "SMS_OUTBOUND") {
          const isInbound = item.itemType === "SMS_INBOUND";
          return (
            <View style={[styles.messageRow, isInbound ? styles.messageRowInbound : styles.messageRowOutbound]}>
              <View style={[styles.messageBubble, isInbound ? styles.messageBubbleInbound : styles.messageBubbleOutbound]}>
                <Text style={[styles.messageLabel, isInbound ? styles.messageLabelInbound : styles.messageLabelOutbound]}>
                  {isInbound ? "Text from caller" : "Text from your business"}
                </Text>
                <Text style={[styles.messageBody, isInbound ? styles.messageBodyInbound : styles.messageBodyOutbound]}>
                  {typeof payload === "object" && payload && "body" in payload && payload.body ? payload.body : item.previewText ?? "No message body"}
                </Text>
                <Text style={[styles.messageMeta, isInbound ? styles.messageMetaInbound : styles.messageMetaOutbound]}>
                  {formatTimestamp(item.occurredAt)}
                  {typeof payload === "object" && payload && "deliveryStatus" in payload && payload.deliveryStatus
                    ? ` • ${payload.deliveryStatus.toLowerCase()}`
                    : ""}
                </Text>
              </View>
            </View>
          );
        }

        if (item.itemType === "VOICEMAIL") {
          const transcript =
            typeof payload === "object" && payload && "transcriptText" in payload ? payload.transcriptText : null;
          const transcriptStatus =
            typeof payload === "object" && payload && "transcriptStatus" in payload ? payload.transcriptStatus : null;
          const durationSeconds =
            typeof payload === "object" && payload && "durationSeconds" in payload ? payload.durationSeconds : null;

          return (
            <View style={styles.timelineCard}>
              <View style={styles.timelineHeader}>
                <View style={[styles.timelineIconCircle, { backgroundColor: `${colors.voicemail}14` }]}>
                  <Ionicons name="mail-open-outline" size={18} color={colors.voicemail} />
                </View>
                <View style={styles.timelineCopy}>
                  <Text style={styles.timelineTitle}>Voicemail</Text>
                  <Text style={styles.timelineMeta}>
                    {formatTimestamp(item.occurredAt)} • {durationSeconds != null ? formatDuration(durationSeconds) : "Duration unavailable"}
                  </Text>
                </View>
                <View style={[styles.stateBadge, item.unreadState === "UNREAD" ? styles.stateBadgeUnread : styles.stateBadgeNeutral]}>
                  <Text style={[styles.stateBadgeLabel, item.unreadState === "UNREAD" ? styles.stateBadgeLabelUnread : styles.stateBadgeLabelNeutral]}>
                    {item.unreadState === "UNREAD" ? "Unheard" : "Heard"}
                  </Text>
                </View>
              </View>
              <Text style={styles.timelineBody}>
                {transcriptStatus === "COMPLETED"
                  ? transcript?.trim() || "Transcript is empty."
                  : transcriptStatus === "PENDING"
                    ? "Transcription is still in progress."
                    : item.previewText ?? "Voicemail saved without a transcript yet."}
              </Text>
            </View>
          );
        }

        const callEventType =
          typeof payload === "object" && payload && "eventType" in payload ? payload.eventType : undefined;
        const callDirection =
          typeof payload === "object" && payload && "direction" in payload ? payload.direction : undefined;
        const callDuration =
          typeof payload === "object" && payload && "durationSeconds" in payload ? payload.durationSeconds : null;
        const callProviderStatus =
          typeof payload === "object" && payload && "providerStatus" in payload ? payload.providerStatus : null;
        const callErrorCode =
          typeof payload === "object" && payload && "errorCode" in payload ? payload.errorCode : null;
        const callVisual = callCopy(callEventType);

        return (
          <View style={styles.timelineCard}>
            <View style={styles.timelineHeader}>
              <View style={[styles.timelineIconCircle, { backgroundColor: `${callVisual.color}14` }]}>
                <Ionicons name={callVisual.icon} size={18} color={callVisual.color} />
              </View>
              <View style={styles.timelineCopy}>
                <Text style={styles.timelineTitle}>{callVisual.title}</Text>
                <Text style={styles.timelineMeta}>
                  {formatTimestamp(item.occurredAt)} • {callDirection === "INBOUND" ? "Inbound" : "Outbound"}
                </Text>
              </View>
            </View>
            <Text style={styles.timelineBody}>
              {callDuration != null ? `Duration ${formatDuration(callDuration)}.` : ""}
              {callProviderStatus ? ` ${callProviderStatus}.` : ""}
              {callErrorCode ? ` Error ${callErrorCode}.` : ""}
            </Text>
          </View>
        );
      }}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>{thread?.title ?? route.params.title}</Text>
          <Text style={styles.subtitle}>{threadSubtitle}</Text>

          {showSaveContactButton ? (
            <Pressable
              onPress={() =>
                navigation.navigate("ContactCard", {
                  initialPhoneNumber: thread?.externalParticipantE164 ?? null,
                  initialName: thread?.title ?? null,
                })
              }
              style={styles.contactButton}
            >
              <Ionicons name="person-add-outline" size={18} color={colors.surface} />
              <Text style={styles.contactButtonLabel}>Save caller as contact</Text>
            </Pressable>
          ) : thread?.contactId ? (
            <Pressable
              onPress={() =>
                navigation.navigate("ContactCard", {
                  contactId: thread.contactId,
                })
              }
              style={styles.secondaryButton}
            >
              <Ionicons name="create-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryButtonLabel}>Edit contact</Text>
            </Pressable>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        query.isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingTitle}>Loading thread</Text>
            <Text style={styles.loadingDescription}>Pulling the full communication timeline now.</Text>
          </View>
        ) : (
          <BrandedEmptyState
            title="No activity in this thread yet"
            description="Texts, calls, and voicemails tied to this number will appear here."
          />
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
    gap: 8,
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    lineHeight: 20,
  },
  contactButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  contactButtonLabel: {
    color: colors.surface,
    fontWeight: "800",
  },
  secondaryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#eff6ff",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  secondaryButtonLabel: {
    color: colors.primary,
    fontWeight: "800",
  },
  messageRow: {
    flexDirection: "row",
  },
  messageRowInbound: {
    justifyContent: "flex-start",
  },
  messageRowOutbound: {
    justifyContent: "flex-end",
  },
  messageBubble: {
    maxWidth: "84%",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  messageBubbleInbound: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 8,
  },
  messageBubbleOutbound: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 8,
  },
  messageLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  messageLabelInbound: {
    color: colors.sms,
  },
  messageLabelOutbound: {
    color: "#dbeafe",
  },
  messageBody: {
    fontSize: 16,
    lineHeight: 22,
  },
  messageBodyInbound: {
    color: colors.text,
  },
  messageBodyOutbound: {
    color: colors.surface,
  },
  messageMeta: {
    fontSize: 12,
  },
  messageMetaInbound: {
    color: colors.muted,
  },
  messageMetaOutbound: {
    color: "#dbeafe",
  },
  timelineCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timelineIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineCopy: {
    flex: 1,
    gap: 2,
  },
  timelineTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
  },
  timelineMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  timelineBody: {
    color: colors.text,
    lineHeight: 21,
  },
  stateBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stateBadgeUnread: {
    backgroundColor: "#ede9fe",
  },
  stateBadgeNeutral: {
    backgroundColor: "#eef2f7",
  },
  stateBadgeLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  stateBadgeLabelUnread: {
    color: colors.voicemail,
  },
  stateBadgeLabelNeutral: {
    color: colors.muted,
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    gap: 10,
  },
  loadingTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  loadingDescription: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
});
