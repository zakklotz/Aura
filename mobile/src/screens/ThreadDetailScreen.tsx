import React, { useEffect } from "react";
import { FlatList, Text, View } from "react-native";
import { RouteProp, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { fetchThread, markThreadRead } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

export function ThreadDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "ThreadDetail">>();
  const threadId = route.params.threadId;
  const query = useQuery({
    queryKey: queryKeys.thread(threadId),
    queryFn: () => fetchThread(threadId),
  });

  useEffect(() => {
    markThreadRead(threadId).catch(() => undefined);
  }, [threadId]);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={query.data?.items ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16 }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>{item.itemType}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{item.previewText ?? "No preview"}</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>Unread state: {item.unreadState}</Text>
        </View>
      )}
      ListHeaderComponent={
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text }}>{query.data?.thread.title ?? route.params.title}</Text>
        </View>
      }
    />
  );
}
