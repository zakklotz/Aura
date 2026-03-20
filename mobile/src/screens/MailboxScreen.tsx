import React, { useState } from "react";
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
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMailbox, markVoicemailHeard } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import { colors } from "../theme/colors";
import type { RootStackParamList } from "../navigation/types";
import { formatDuration, formatTimestamp } from "../lib/formatters";
import { BrandedEmptyState } from "../components/BrandedEmptyState";

export function MailboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.mailbox, queryFn: fetchMailbox });
  const [markingVoicemailId, setMarkingVoicemailId] = useState<string | null>(null);

  async function handleMarkHeard(voicemailId: string | null) {
    if (!voicemailId || markingVoicemailId) {
      return;
    }

    try {
      setMarkingVoicemailId(voicemailId);
      await markVoicemailHeard(voicemailId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.mailbox }),
        queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
      ]);
    } finally {
      setMarkingVoicemailId(null);
    }
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={query.data?.items ?? []}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => navigation.navigate("ThreadDetail", { threadId: item.threadId, title: item.title })}
          style={({ pressed }) => [styles.voicemailCard, pressed && styles.voicemailCardPressed]}
        >
          <View style={styles.voicemailHeader}>
            <View style={styles.voicemailHeaderLeft}>
              <View style={[styles.iconCircle, { backgroundColor: `${colors.voicemail}14` }]}>
                <Ionicons name="mail-open-outline" size={18} color={colors.voicemail} />
              </View>
              <View style={styles.copyBlock}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta}>
                  {formatTimestamp(item.occurredAt)} • {formatDuration(item.durationSeconds)}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, item.unheard ? styles.statusBadgeUnread : styles.statusBadgeHeard]}>
              <Text style={[styles.statusBadgeLabel, item.unheard ? styles.statusBadgeLabelUnread : styles.statusBadgeLabelHeard]}>
                {item.unheard ? "Unheard" : "Heard"}
              </Text>
            </View>
          </View>

          <Text style={styles.transcript}>
            {item.transcriptSnippet ??
              (item.transcriptStatus === "PENDING"
                ? "Transcription is still in progress."
                : "This voicemail has no transcript yet.")}
          </Text>

          <View style={styles.actionsRow}>
            <View style={styles.transcriptPill}>
              <Ionicons name="document-text-outline" size={14} color={colors.primary} />
              <Text style={styles.transcriptPillLabel}>
                {item.transcriptStatus ? item.transcriptStatus.toLowerCase() : "no transcript"}
              </Text>
            </View>

            {item.unheard ? (
              <Pressable
                onPress={() => void handleMarkHeard(item.voicemailId)}
                style={styles.heardButton}
                disabled={markingVoicemailId === item.voicemailId}
              >
                {markingVoicemailId === item.voicemailId ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color={colors.surface} />
                    <Text style={styles.heardButtonLabel}>Mark heard</Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      )}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Mailbox</Text>
          <Text style={styles.headerDescription}>
            Every voicemail lives here, with unheard items surfaced first through the unread badge system.
          </Text>
        </View>
      }
      ListEmptyComponent={
        query.isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingTitle}>Loading voicemail</Text>
          </View>
        ) : (
          <BrandedEmptyState
            title="Mailbox is empty"
            description="Voicemails from your business number will appear here as soon as they arrive or are imported."
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
    gap: 6,
    marginBottom: 8,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
  },
  headerDescription: {
    color: colors.muted,
    lineHeight: 20,
  },
  voicemailCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  voicemailCardPressed: {
    opacity: 0.92,
  },
  voicemailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  voicemailHeaderLeft: {
    flexDirection: "row",
    flex: 1,
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  copyBlock: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  statusBadgeUnread: {
    backgroundColor: "#ede9fe",
  },
  statusBadgeHeard: {
    backgroundColor: "#eef2f7",
  },
  statusBadgeLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  statusBadgeLabelUnread: {
    color: colors.voicemail,
  },
  statusBadgeLabelHeard: {
    color: colors.muted,
  },
  transcript: {
    color: colors.text,
    lineHeight: 21,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  transcriptPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#eff6ff",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  transcriptPillLabel: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 12,
  },
  heardButton: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: colors.text,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  heardButtonLabel: {
    color: colors.surface,
    fontWeight: "700",
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
});
