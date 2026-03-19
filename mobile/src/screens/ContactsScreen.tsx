import React from "react";
import { FlatList, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchContacts } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import { colors } from "../theme/colors";

export function ContactsScreen() {
  const query = useQuery({ queryKey: queryKeys.contacts, queryFn: fetchContacts });

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={query.data?.contacts ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16 }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>{item.displayName}</Text>
          <Text style={{ color: colors.muted }}>{item.phoneNumbers.map((phoneNumber) => phoneNumber.e164).join(", ")}</Text>
        </View>
      )}
      ListHeaderComponent={<Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, marginBottom: 12 }}>Contacts</Text>}
      ListEmptyComponent={<Text style={{ color: colors.muted }}>No contacts yet.</Text>}
    />
  );
}
