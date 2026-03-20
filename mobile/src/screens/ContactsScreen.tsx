import React, { useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fetchContacts, importContactsCsv } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import { colors } from "../theme/colors";
import type { RootStackParamList } from "../navigation/types";
import { BrandedEmptyState } from "../components/BrandedEmptyState";
import { parseContactCsv } from "../lib/contactCsv";
import { ApiError } from "../services/api/client";

const heroImage = require("../../assets/icon.png");

export function ContactsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.contacts, queryFn: fetchContacts });
  const [isImporting, setIsImporting] = useState(false);
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    createdCount: number;
    mergedCount: number;
    skippedCount: number;
    skippedInFile: number;
  } | null>(null);

  async function handleImportCsv() {
    if (isImporting) {
      return;
    }

    try {
      setIsImporting(true);
      setImportErrorMessage(null);
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/*", "text/csv", "text/comma-separated-values", "application/csv", "application/vnd.ms-excel", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }

      const fileContents = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const parsed = parseContactCsv(fileContents);
      if (parsed.rows.length === 0) {
        setImportSummary({
          createdCount: 0,
          mergedCount: 0,
          skippedCount: 0,
          skippedInFile: parsed.skippedRows,
        });
        return;
      }

      const response = await importContactsCsv({ rows: parsed.rows });
      setImportSummary({
        createdCount: response.job.createdCount,
        mergedCount: response.job.mergedCount,
        skippedCount: response.job.skippedCount,
        skippedInFile: parsed.skippedRows,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
    } catch (error) {
      setImportErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Aura could not import that CSV file."
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={query.data?.contacts ?? []}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => navigation.navigate("ContactCard", { contactId: item.id })}
          style={({ pressed }) => [styles.contactCard, pressed && styles.contactCardPressed]}
        >
          <View style={styles.contactAvatar}>
            <Text style={styles.contactAvatarLabel}>{item.displayName.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.contactBody}>
            <Text style={styles.contactName}>{item.displayName}</Text>
            <Text style={styles.contactNumbers}>{item.phoneNumbers.map((phoneNumber) => phoneNumber.e164).join(" • ")}</Text>
            {item.notes ? (
              <Text numberOfLines={2} style={styles.contactNotes}>
                {item.notes}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      )}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.heroCard}>
            <Image source={heroImage} style={styles.heroImage} resizeMode="contain" />
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>Aura</Text>
              <Text style={styles.heroTitle}>Contacts</Text>
              <Text style={styles.heroDescription}>Save callers and texters so your inbox shows real names instead of raw numbers.</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable onPress={() => navigation.navigate("ContactCard")} style={styles.addButton}>
              <Ionicons name="add" size={18} color={colors.surface} />
              <Text style={styles.addButtonLabel}>Add contact</Text>
            </Pressable>

            <Pressable onPress={() => void handleImportCsv()} style={styles.importButton} disabled={isImporting}>
              {isImporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="document-attach-outline" size={18} color={colors.primary} />
                  <Text style={styles.importButtonLabel}>Import CSV</Text>
                </>
              )}
            </Pressable>
          </View>

          {importSummary ? (
            <View style={styles.importSummaryCard}>
              <Text style={styles.importSummaryTitle}>Last CSV import</Text>
              <Text style={styles.importSummaryBody}>
                {importSummary.createdCount} created • {importSummary.mergedCount} merged • {importSummary.skippedCount} skipped by API • {importSummary.skippedInFile} skipped in file cleanup
              </Text>
            </View>
          ) : null}

          {importErrorMessage ? <Text style={styles.importError}>{importErrorMessage}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <BrandedEmptyState
          title={query.isLoading ? "Loading contacts" : "No contacts yet"}
          description={
            query.isLoading
              ? "We&apos;re fetching your saved contacts."
              : "Create your first contact to label conversations and unknown callers."
          }
          actionLabel={!query.isLoading ? "Create contact" : undefined}
          onActionPress={!query.isLoading ? () => navigation.navigate("ContactCard") : undefined}
        />
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
    width: 68,
    height: 68,
    borderRadius: 18,
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
  addButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addButtonLabel: {
    color: colors.surface,
    fontWeight: "800",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  importButton: {
    alignSelf: "flex-start",
    backgroundColor: "#eff6ff",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  importButtonLabel: {
    color: colors.primary,
    fontWeight: "800",
  },
  importSummaryCard: {
    backgroundColor: "#eff6ff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    padding: 14,
    gap: 4,
  },
  importSummaryTitle: {
    color: colors.primary,
    fontWeight: "800",
  },
  importSummaryBody: {
    color: colors.text,
    lineHeight: 20,
  },
  importError: {
    color: colors.danger,
    lineHeight: 20,
  },
  contactCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  contactCardPressed: {
    opacity: 0.9,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  contactAvatarLabel: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 18,
  },
  contactBody: {
    flex: 1,
    gap: 3,
  },
  contactName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  contactNumbers: {
    color: colors.muted,
    fontSize: 13,
  },
  contactNotes: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
});
