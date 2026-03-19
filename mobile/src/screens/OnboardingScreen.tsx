import React from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchBootstrap } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import { colors } from "../theme/colors";

export function OnboardingScreen() {
  const query = useQuery({ queryKey: queryKeys.bootstrap, queryFn: fetchBootstrap });
  const onboardingState = query.data?.business?.onboardingState ?? "NEEDS_BUSINESS_PROFILE";

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, marginBottom: 12 }}>Finish Setup</Text>
      <Text style={{ color: colors.muted, marginBottom: 12 }}>
        Current onboarding state: {onboardingState}
      </Text>
      <Text style={{ color: colors.muted }}>
        This flow is reserved for business profile, phone number, and greeting setup only.
      </Text>
    </View>
  );
}
