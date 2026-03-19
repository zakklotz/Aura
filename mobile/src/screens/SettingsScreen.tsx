import React from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchSettings } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import { colors } from "../theme/colors";

export function SettingsScreen() {
  const query = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });
  const data = query.data as
    | {
        business?: { displayName?: string | null; onboardingState?: string };
        voiceRegistrationState?: string;
        playbackDefaultsToSpeaker?: boolean;
      }
    | undefined;

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, marginBottom: 12 }}>Settings</Text>
      <Text style={{ color: colors.text, marginBottom: 8 }}>Business: {data?.business?.displayName ?? "Not set"}</Text>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>Onboarding: {data?.business?.onboardingState ?? "unknown"}</Text>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>Voice registration: {data?.voiceRegistrationState ?? "unknown"}</Text>
      <Text style={{ color: colors.muted }}>
        Voicemail playback defaults to speaker: {data?.playbackDefaultsToSpeaker ? "yes" : "no"}
      </Text>
    </View>
  );
}
