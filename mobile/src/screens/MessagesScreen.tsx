import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fetchThreads } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import { BrandedEmptyState } from "../components/BrandedEmptyState";
import { formatTimestamp } from "../lib/formatters";

const heroImage = require("../../assets/approved-original-1024.png");

function countSummary(input: { unreadSmsCount: number; unreadMissedCallCount: number; unheardVoicemailCount: number }) {
  const parts: string[] = [];
  if (input.unreadSmsCount > 0) parts.push(`${input.unreadSmsCount} text${input.unreadSmsCount === 1 ? "" : "s"}`);
  if (input.unreadMissedCallCount > 0) parts.push(`${input.unreadMissedCallCount} missed call${input.unreadMissedCallCount === 1 ? "" : "s"}`);
  if (input.unheardVoicemailCount > 0) parts.push(`${input.unheardVoicemailCount} voicemail${input.unheardVoicemailCount === 1 ? "" : "s"}`);
  return parts.join(" • ");
}

export function MessagesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const query = useQuery({ queryKey: queryKeys.threads, queryFn: fetchThreads });

  const items = query.data?.items ?? [];
  const isInitialLoading = query.isLoading && items.length === 0;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: tabBarHeight + Math.max(insets.bottom, 16),
        },
      ]}
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => {
        void query.refetch();
      }} tintColor={colors.primary} />}
      renderItem={({ item }) => {
        const unreadSummary = countSummary(item);
        const hasUnread = item.totalUnreadCount > 0;
        return (
          <Pressable
            onPress={() => navigation.navigate("ThreadDetail", { threadId: item.id, title: item.title })}
            style={({ pressed }) => [styles.threadCard, pressed && styles.threadCardPressed]}
          >
            <View style={styles.threadTopRow}>
              <View style={styles.threadTitleBlock}>
                <Text numberOfLines={1} style={styles.threadTitle}>
                  {item.title}
                </Text>
                <Text style={styles.threadTimestamp}>{formatTimestamp(item.lastOccurredAt)}</Text>
              </View>
              {hasUnread ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeLabel}>{item.totalUnreadCount}</Text>
                </View>
              ) : null}
            </View>

            <Text numberOfLines={2} style={styles.threadSubtitle}>
              {item.subtitle ?? "No preview available yet"}
            </Text>

            <View style={styles.threadMetaRow}>
              <View style={styles.metaPill}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.sms} />
                <Text style={styles.metaPillText}>{item.unreadSmsCount}</Text>
              </View>
              <View style={styles.metaPill}>
                <Ionicons name="call-outline" size={14} color={colors.missedCall} />
                <Text style={styles.metaPillText}>{item.unreadMissedCallCount}</Text>
              </View>
              <View style={styles.metaPill}>
                <Ionicons name="mail-open-outline" size={14} color={colors.voicemail} />
                <Text style={styles.metaPillText}>{item.unheardVoicemailCount}</Text>
              </View>
            </View>

            {unreadSummary ? <Text style={styles.unreadSummary}>{unreadSummary}</Text> : null}
          </Pressable>
        );
      }}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.heroCard}>
            <Image source={heroImage} style={styles.heroImage} resizeMode="contain" />
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>Aura</Text>
              <Text style={styles.heroTitle}>Inbox</Text>
              <Text style={styles.heroDescription}>
                Texts, missed calls, and voicemails all land here in one communication timeline.
              </Text>
            </View>
          </View>
        </View>
      }
      ListEmptyComponent={
        isInitialLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingTitle}>Loading your inbox</Text>
            <Text style={styles.loadingDescription}>We&apos;re pulling the latest thread summaries now.</Text>
          </View>
        ) : (
          <BrandedEmptyState
            title="Your inbox is ready"
            description="New texts, missed calls, and voicemails will show up here."
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
    gap: 16,
    marginBottom: 8,
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
  threadCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  threadCardPressed: {
    opacity: 0.9,
  },
  threadTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  threadTitleBlock: {
    flex: 1,
    gap: 2,
  },
  threadTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 17,
  },
  threadTimestamp: {
    color: colors.muted,
    fontSize: 12,
  },
  unreadBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  unreadBadgeLabel: {
    color: colors.surface,
    fontWeight: "800",
    fontSize: 12,
  },
  threadSubtitle: {
    color: colors.muted,
    lineHeight: 20,
  },
  threadMetaRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaPillText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 12,
  },
  unreadSummary: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 13,
  },
  loadingState: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 36,
  },
  loadingTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 18,
  },
  loadingDescription: {
    color: colors.muted,
    textAlign: "center",
  },
});
