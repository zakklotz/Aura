import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fetchThread, markThreadRead, sendMessage } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import { formatDuration, formatTimestamp } from "../lib/formatters";
import { BrandedEmptyState } from "../components/BrandedEmptyState";
import {
  applySendResult,
  canRetryMessage,
  getDisplayConversationItems,
  getMessageBody,
  getMessageStateLabel,
  insertOptimisticMessage,
  markSendFailed,
  markThreadReadOptimistically,
  type ConversationItem,
} from "../services/messages/threadState";

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

function createClientTempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ThreadDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "ThreadDetail">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const threadId = route.params.threadId;
  const [composerValue, setComposerValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const hasMarkedReadRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.thread(threadId),
    queryFn: () => fetchThread(threadId),
  });

  const thread = query.data?.thread;
  const items = useMemo(
    () => getDisplayConversationItems((query.data?.items ?? []) as ConversationItem[]),
    [query.data?.items]
  );
  const isInitialLoading = query.isLoading && items.length === 0;
  const showSaveContactButton = Boolean(thread && !thread.contactId && thread.externalParticipantE164);

  const threadSubtitle = useMemo(() => {
    if (!thread) {
      return route.params.title;
    }

    return thread.contactId ? thread.externalParticipantE164 : `${thread.externalParticipantE164} • Unknown contact`;
  }, [route.params.title, thread]);

  useEffect(() => {
    hasMarkedReadRef.current = null;
  }, [threadId]);

  useEffect(() => {
    if (!query.data || hasMarkedReadRef.current === threadId) {
      return;
    }

    hasMarkedReadRef.current = threadId;
    markThreadReadOptimistically(queryClient, threadId);
    void markThreadRead(threadId).catch(() => {
      hasMarkedReadRef.current = null;
      void Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
      ]);
    });
  }, [query.data, query.refetch, queryClient, threadId]);

  async function submitMessage(body: string) {
    const trimmedBody = body.trim();
    if (!trimmedBody || !thread || isSending) {
      return;
    }

    const clientTempId = createClientTempId();
    const occurredAt = new Date().toISOString();
    insertOptimisticMessage(queryClient, {
      threadId,
      threadTitle: thread.title,
      externalParticipantE164: thread.externalParticipantE164,
      body: trimmedBody,
      occurredAt,
      clientTempId,
    });
    setComposerValue("");
    setIsSending(true);

    try {
      const response = await sendMessage({
        to: thread.externalParticipantE164,
        body: trimmedBody,
        clientTempId,
      });
      applySendResult(queryClient, threadId, clientTempId, response.message);
    } catch (error) {
      markSendFailed(queryClient, threadId, clientTempId, "Couldn't send");
    } finally {
      setIsSending(false);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.thread(threadId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
      ]);
    }
  }

  function handleRetry(item: ConversationItem) {
    const retryBody = getMessageBody(item).trim();
    if (!retryBody) {
      return;
    }

    void submitMessage(retryBody);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
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

      <FlatList
        style={styles.list}
        contentContainerStyle={[styles.listContent, items.length === 0 && styles.listContentEmpty]}
        data={items}
        inverted
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        renderItem={({ item }) => {
          if (item.itemType === "SMS_INBOUND" || item.itemType === "SMS_OUTBOUND") {
            const isInbound = item.itemType === "SMS_INBOUND";
            const stateLabel = getMessageStateLabel(item);
            return (
              <View style={[styles.messageRow, isInbound ? styles.messageRowInbound : styles.messageRowOutbound]}>
                <View style={[styles.messageBubble, isInbound ? styles.messageBubbleInbound : styles.messageBubbleOutbound]}>
                  <Text style={[styles.messageBody, isInbound ? styles.messageBodyInbound : styles.messageBodyOutbound]}>
                    {getMessageBody(item) || "No message body"}
                  </Text>
                  <Text style={[styles.messageMeta, isInbound ? styles.messageMetaInbound : styles.messageMetaOutbound]}>
                    {formatTimestamp(item.occurredAt)}
                    {!isInbound && stateLabel ? ` • ${stateLabel}` : ""}
                  </Text>
                  {!isInbound && canRetryMessage(item) ? (
                    <Pressable onPress={() => handleRetry(item)} style={styles.retryButton}>
                      <Text style={styles.retryButtonLabel}>Retry</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          }

          if (item.itemType === "VOICEMAIL") {
            const transcript = item.payload && "transcriptText" in item.payload ? item.payload.transcriptText : null;
            const transcriptStatus = item.payload && "transcriptStatus" in item.payload ? item.payload.transcriptStatus : null;
            const durationSeconds = item.payload && "durationSeconds" in item.payload ? item.payload.durationSeconds : null;

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

          const callEventType = item.payload && "eventType" in item.payload ? item.payload.eventType : undefined;
          const callDirection = item.payload && "direction" in item.payload ? item.payload.direction : undefined;
          const callDuration = item.payload && "durationSeconds" in item.payload ? item.payload.durationSeconds : null;
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
              {callDuration != null ? <Text style={styles.timelineBody}>Duration {formatDuration(callDuration)}.</Text> : null}
            </View>
          );
        }}
        ListEmptyComponent={
          isInitialLoading ? (
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

      <View style={[styles.composerShell, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.composerCard}>
          <TextInput
            value={composerValue}
            onChangeText={setComposerValue}
            placeholder="Type a message"
            placeholderTextColor={colors.muted}
            style={styles.composerInput}
            multiline
            maxLength={1600}
          />
          <Pressable
            onPress={() => void submitMessage(composerValue)}
            disabled={!composerValue.trim() || !thread || isSending}
            style={({ pressed }) => [
              styles.sendButton,
              (!composerValue.trim() || !thread || isSending) && styles.sendButtonDisabled,
              pressed && composerValue.trim() && thread && !isSending ? styles.sendButtonPressed : null,
            ]}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <>
                <Ionicons name="arrow-up" size={18} color={colors.surface} />
                <Text style={styles.sendButtonLabel}>Send</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 8,
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  itemSeparator: {
    height: 12,
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
    gap: 8,
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
  retryButton: {
    alignSelf: "flex-end",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryButtonLabel: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "800",
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
  loadingState: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 28,
  },
  loadingTitle: {
    color: colors.text,
    fontWeight: "700",
  },
  loadingDescription: {
    color: colors.muted,
    textAlign: "center",
  },
  composerShell: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.background,
  },
  composerCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sendButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonPressed: {
    opacity: 0.9,
  },
  sendButtonLabel: {
    color: colors.surface,
    fontWeight: "800",
  },
});
