import React from "react";
import { Text, View } from "react-native";
import { colors } from "../theme/colors";

export function SignInScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text, marginBottom: 8 }}>Aura</Text>
      <Text style={{ color: colors.muted, textAlign: "center" }}>
        Clerk authentication is wired at the app shell level with the current Expo SDK integration. Add the sign-in UI flow here for Google and email/password.
      </Text>
    </View>
  );
}
