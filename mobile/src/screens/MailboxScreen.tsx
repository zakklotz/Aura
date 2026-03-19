import React from "react";
import { FlatList, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchMailbox } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import { colors } from "../theme/colors";

export function MailboxScreen() {
  const query = useQuery({ queryKey: queryKeys.mailbox, queryFn: fetchMailbox });

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={query.data?.items ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16 }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>{item.title}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{item.transcriptSnippet ?? "No transcript yet"}</Text>
          <Text style={{ color: item.unheard ? colors.voicemail : colors.muted, marginTop: 8 }}>
            {item.unheard ? "Unheard" : "Heard"}
          </Text>
        </View>
      )}
      ListHeaderComponent={<Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, marginBottom: 12 }}>Mailbox</Text>}
    />
  );
}
