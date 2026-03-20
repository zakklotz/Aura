import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { createContact, fetchContacts, updateContact } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

export function ContactCardScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "ContactCard">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const contactsQuery = useQuery({ queryKey: queryKeys.contacts, queryFn: fetchContacts });
  const [displayName, setDisplayName] = useState(route.params?.initialName ?? "");
  const [phoneNumber, setPhoneNumber] = useState(route.params?.initialPhoneNumber ?? "");
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const editingContact = useMemo(
    () => contactsQuery.data?.contacts.find((contact) => contact.id === route.params?.contactId) ?? null,
    [contactsQuery.data?.contacts, route.params?.contactId]
  );

  useEffect(() => {
    if (!editingContact) {
      return;
    }
    setDisplayName(editingContact.displayName);
    setNotes(editingContact.notes ?? "");
    setPhoneNumber(editingContact.phoneNumbers[0]?.e164 ?? route.params?.initialPhoneNumber ?? "");
  }, [editingContact, route.params?.initialPhoneNumber]);

  const isEditing = Boolean(route.params?.contactId);

  async function handleSave() {
    const trimmedDisplayName = displayName.trim();
    const trimmedPhoneNumber = phoneNumber.trim();

    if (!trimmedDisplayName) {
      setErrorMessage("Enter a contact name.");
      return;
    }

    if (!isEditing && !trimmedPhoneNumber) {
      setErrorMessage("Enter at least one phone number.");
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);

    try {
      if (isEditing && route.params?.contactId) {
        await updateContact(route.params.contactId, {
          displayName: trimmedDisplayName,
          notes: notes.trim() ? notes.trim() : null,
        });
      } else {
        await createContact({
          displayName: trimmedDisplayName,
          notes: notes.trim() || undefined,
          phoneNumbers: [
            {
              e164: trimmedPhoneNumber,
              label: "mobile",
            },
          ],
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
      ]);
      navigation.goBack();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save this contact.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isEditing && contactsQuery.isLoading && !editingContact) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingLabel}>Loading contact…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>{isEditing ? "Edit contact" : "Add contact"}</Text>
          <Text style={styles.subtitle}>
            {isEditing
              ? "Update the name and notes used across inbox, voicemail, and call history."
              : "Save this number so Aura can label future texts, calls, and voicemails."}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Acme Front Desk"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Phone number</Text>
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+15555550123"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              editable={!isEditing}
              style={[styles.input, isEditing && styles.inputReadOnly]}
            />
            {isEditing ? <Text style={styles.helpText}>Phone numbers are read-only in this first pass.</Text> : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything useful for the team to know"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              style={[styles.input, styles.notesInput]}
            />
          </View>

          {editingContact?.phoneNumbers.length ? (
            <View style={styles.phoneList}>
              <Text style={styles.label}>Saved numbers</Text>
              {editingContact.phoneNumbers.map((savedPhone) => (
                <View key={savedPhone.id} style={styles.phoneChip}>
                  <Text style={styles.phoneChipLabel}>
                    {savedPhone.label ? `${savedPhone.label} • ` : ""}
                    {savedPhone.e164}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable onPress={handleSave} style={styles.primaryButton} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <Text style={styles.primaryButtonLabel}>{isEditing ? "Save changes" : "Create contact"}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: colors.text,
    fontWeight: "700",
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fbfbfc",
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 16,
  },
  inputReadOnly: {
    opacity: 0.7,
  },
  notesInput: {
    minHeight: 108,
    paddingTop: 14,
    textAlignVertical: "top",
  },
  helpText: {
    color: colors.muted,
    fontSize: 12,
  },
  phoneList: {
    gap: 8,
  },
  phoneChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#eff6ff",
    alignSelf: "flex-start",
  },
  phoneChipLabel: {
    color: colors.primary,
    fontWeight: "600",
  },
  errorText: {
    color: colors.danger,
    lineHeight: 20,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonLabel: {
    color: colors.surface,
    fontWeight: "800",
    fontSize: 16,
  },
  loadingState: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingLabel: {
    color: colors.muted,
  },
});
