import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useClerk } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSettings,
  type BootstrapPayload,
  type SettingsPayload,
  updateCommunicationSettings,
} from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import { useCallStore } from "../store/callStore";
import { colors } from "../theme/colors";
import { formatTimestamp } from "../lib/formatters";
import { BrandedEmptyState } from "../components/BrandedEmptyState";
import { ApiError } from "../services/api/client";
import { ReadinessPill } from "../components/ReadinessPill";

const heroImage = require("../../assets/approved-original-1024.png");

export function SettingsScreen() {
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const { voiceRegistrationState } = useCallStore();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const settingsQuery = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });

  async function handleSignOut() {
    try {
      setIsSigningOut(true);
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleSaveName() {
    const nextName = draftName.trim();
    if (!nextName) {
      setSaveErrorMessage("Business name can't be blank.");
      return;
    }

    try {
      setIsSavingName(true);
      setSaveErrorMessage(null);
      const result = await updateCommunicationSettings({ displayName: nextName });
      queryClient.setQueryData<SettingsPayload | undefined>(queryKeys.settings, (current) =>
        current
          ? {
              ...current,
              business: {
                ...current.business,
                displayName: result.business.displayName,
                onboardingState: result.business.onboardingState,
              },
            }
          : current
      );
      queryClient.setQueryData<BootstrapPayload | undefined>(queryKeys.bootstrap, (current) =>
        current && current.business
          ? {
              ...current,
              business: {
                ...current.business,
                displayName: result.business.displayName,
                onboardingState: result.business.onboardingState,
              },
            }
          : current
      );
      setDraftName(result.business.displayName ?? "");
      setIsEditingName(false);
      await Promise.all([
        settingsQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
      ]);
    } catch (error) {
      setSaveErrorMessage(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Aura couldn't save your business name."
      );
    } finally {
      setIsSavingName(false);
    }
  }

  const data = settingsQuery.data;
  const isReady =
    data != null &&
    voiceRegistrationState === "ready" &&
    data.featureReadiness.voiceConfigured &&
    data.featureReadiness.hasPrimaryPhoneNumber;
  const settingsErrorMessage =
    settingsQuery.error instanceof ApiError || settingsQuery.error instanceof Error
      ? settingsQuery.error.message
      : null;

  useEffect(() => {
    if (!isEditingName) {
      setDraftName(data?.business.displayName ?? "");
      setSaveErrorMessage(null);
    }
  }, [data?.business.displayName, isEditingName]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={settingsQuery.isRefetching}
          onRefresh={() => {
            void settingsQuery.refetch();
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.heroCard}>
        <Image source={heroImage} style={styles.heroImage} resizeMode="contain" />
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>Aura</Text>
          <Text style={styles.heroTitle}>Settings</Text>
          <Text style={styles.heroDescription}>
            See your business name, phone number, voicemail greeting, and readiness in one place.
          </Text>
        </View>
      </View>

      {settingsQuery.isLoading && !data ? (
        <BrandedEmptyState
          title="Loading settings"
          description="We&apos;re pulling your communication settings and business summary."
        />
      ) : null}

      {!settingsQuery.isLoading && !data && settingsErrorMessage ? (
        <BrandedEmptyState
          title="Settings could not load"
          description={settingsErrorMessage}
          actionLabel="Try again"
          onActionPress={() => {
            void settingsQuery.refetch();
          }}
        />
      ) : null}

      {data ? (
        <>
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="business-outline" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Business</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowLabel}>Name</Text>
                {!isEditingName ? (
                  <Pressable onPress={() => setIsEditingName(true)} style={styles.editButton}>
                    <Text style={styles.editButtonLabel}>Edit</Text>
                  </Pressable>
                ) : null}
              </View>
              {isEditingName ? (
                <>
                  <TextInput
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="Business name"
                    placeholderTextColor={colors.muted}
                    style={styles.nameInput}
                  />
                  <View style={styles.nameActions}>
                    <Pressable
                      onPress={handleSaveName}
                      style={[styles.nameActionButton, styles.primaryActionButton]}
                      disabled={isSavingName}
                    >
                      {isSavingName ? (
                        <ActivityIndicator size="small" color={colors.surface} />
                      ) : (
                        <Text style={styles.primaryActionButtonLabel}>Save</Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setIsEditingName(false);
                        setDraftName(data.business.displayName ?? "");
                      }}
                      style={[styles.nameActionButton, styles.secondaryActionButton]}
                      disabled={isSavingName}
                    >
                      <Text style={styles.secondaryActionButtonLabel}>Cancel</Text>
                    </Pressable>
                  </View>
                  {saveErrorMessage ? <Text style={styles.inlineError}>{saveErrorMessage}</Text> : null}
                </>
              ) : (
                <Text style={styles.rowValue}>{data.business.displayName ?? "Business name not set"}</Text>
              )}
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Setup state</Text>
              <Text style={styles.rowValue}>{data.business.onboardingState.replaceAll("_", " ")}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Primary number</Text>
              <Text style={styles.rowValue}>
                {data.primaryPhoneNumber
                  ? `${data.primaryPhoneNumber.e164}${data.primaryPhoneNumber.label ? ` • ${data.primaryPhoneNumber.label}` : ""}`
                  : "No primary number assigned yet"}
              </Text>
            </View>
          </View>

          {data.featureReadiness.missingSetupStep || !data.featureReadiness.voiceConfigured ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="construct-outline" size={18} color={colors.primary} />
                <Text style={styles.sectionTitle}>Setup checklist</Text>
              </View>
              <View style={styles.checklistRow}>
                <Ionicons
                  name={data.business.displayName ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={data.business.displayName ? colors.success : colors.muted}
                />
                <Text style={styles.checklistCopy}>Business profile {data.business.displayName ? "is set" : "still needs a display name"}</Text>
              </View>
              <View style={styles.checklistRow}>
                <Ionicons
                  name={data.featureReadiness.hasPrimaryPhoneNumber ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={data.featureReadiness.hasPrimaryPhoneNumber ? colors.success : colors.muted}
                />
                <Text style={styles.checklistCopy}>
                  {data.featureReadiness.hasPrimaryPhoneNumber
                    ? "Business phone number is connected"
                    : "Business phone number is still missing"}
                </Text>
              </View>
              <View style={styles.checklistRow}>
                <Ionicons
                  name={data.greetings.length ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={data.greetings.length ? colors.success : colors.muted}
                />
                <Text style={styles.checklistCopy}>
                  {data.greetings.length ? "Voicemail greeting exists" : "Voicemail greeting still needs to be created"}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="call-outline" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Phone</Text>
            </View>
            <ReadinessPill ready={isReady} />
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="mic-outline" size={18} color={colors.voicemail} />
              <Text style={styles.sectionTitle}>Voicemail greetings</Text>
            </View>
            {data.greetings.length ? (
              data.greetings.map((greeting) => (
                <View key={greeting.id} style={styles.greetingRow}>
                  <View style={styles.greetingCopy}>
                    <Text style={styles.greetingTitle}>{greeting.label ?? "Untitled greeting"}</Text>
                    <Text style={styles.greetingMeta}>
                      {greeting.mode === "TTS" ? "Text-to-speech" : "Recorded"} • Updated {formatTimestamp(greeting.updatedAt)}
                    </Text>
                    <Text numberOfLines={2} style={styles.greetingPreview}>
                      {greeting.mode === "TTS"
                        ? greeting.ttsText ?? "No text content"
                        : greeting.audioUrl
                          ? "Recorded greeting is uploaded and ready."
                          : "Recorded greeting file is missing."}
                    </Text>
                  </View>
                  {greeting.isActive ? (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeLabel}>Active</Text>
                    </View>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.emptyCopy}>No greetings yet. Add one during business setup or from the API settings routes.</Text>
            )}
          </View>

          <Pressable onPress={handleSignOut} style={styles.signOutButton} disabled={isSigningOut}>
            {isSigningOut ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={18} color={colors.surface} />
                <Text style={styles.signOutLabel}>Sign out</Text>
              </>
            )}
          </Pressable>
        </>
      ) : null}
    </ScrollView>
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
    gap: 16,
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
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  row: {
    gap: 4,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowLabel: {
    color: colors.muted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  rowValue: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  editButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#eff6ff",
  },
  editButtonLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  nameInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fbfbfc",
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 16,
  },
  nameActions: {
    flexDirection: "row",
    gap: 10,
  },
  nameActionButton: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionButton: {
    backgroundColor: colors.primary,
  },
  primaryActionButtonLabel: {
    color: colors.surface,
    fontWeight: "800",
  },
  secondaryActionButton: {
    backgroundColor: "#eef2f7",
  },
  secondaryActionButtonLabel: {
    color: colors.text,
    fontWeight: "700",
  },
  inlineError: {
    color: colors.danger,
    fontWeight: "600",
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checklistCopy: {
    color: colors.text,
    flex: 1,
    lineHeight: 20,
  },
  statusError: {
    color: colors.danger,
    fontWeight: "700",
    lineHeight: 20,
  },
  greetingRow: {
    borderRadius: 16,
    backgroundColor: "#fafbfc",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  greetingCopy: {
    flex: 1,
    gap: 4,
  },
  greetingTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  greetingMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  greetingPreview: {
    color: colors.text,
    lineHeight: 19,
  },
  activeBadge: {
    backgroundColor: "#dcfce7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeBadgeLabel: {
    color: colors.success,
    fontWeight: "800",
    fontSize: 12,
  },
  emptyCopy: {
    color: colors.muted,
    lineHeight: 20,
  },
  signOutButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  signOutLabel: {
    color: colors.surface,
    fontWeight: "800",
    fontSize: 16,
  },
});
