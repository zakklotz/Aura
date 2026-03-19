import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fetchThreads } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

export function MessagesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const query = useQuery({ queryKey: queryKeys.threads, queryFn: fetchThreads });

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={query.data?.items ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => navigation.navigate("ThreadDetail", { threadId: item.id, title: item.title })}
          style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16 }}
        >
          <Text style={{ color: colors.text, fontWeight: "600" }}>{item.title}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{item.subtitle ?? "No activity yet"}</Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>
            SMS {item.unreadSmsCount} • Missed {item.unreadMissedCallCount} • VM {item.unheardVoicemailCount}
          </Text>
        </Pressable>
      )}
      ListHeaderComponent={
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text }}>Messages</Text>
        </View>
      }
      ListEmptyComponent={<Text style={{ color: colors.muted }}>No threads yet.</Text>}
    />
  );
}
