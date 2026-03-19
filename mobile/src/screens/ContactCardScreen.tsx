import React from "react";
import { Text, View } from "react-native";
import { colors } from "../theme/colors";

export function ContactCardScreen() {
  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, marginBottom: 12 }}>Contact Card</Text>
      <Text style={{ color: colors.muted }}>Contact detail screen placeholder wired into the stack.</Text>
    </View>
  );
}
