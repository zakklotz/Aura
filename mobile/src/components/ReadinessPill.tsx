import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export function ReadinessPill({ ready }: { ready: boolean }) {
  return (
    <View style={[styles.pill, ready ? styles.pillReady : styles.pillNotReady]}>
      <View style={[styles.dot, ready ? styles.dotReady : styles.dotNotReady]} />
      <Text style={[styles.label, ready ? styles.labelReady : styles.labelNotReady]}>{ready ? "Ready" : "Not ready"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pillReady: {
    backgroundColor: "#dcfce7",
  },
  pillNotReady: {
    backgroundColor: "#fee2e2",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  dotReady: {
    backgroundColor: colors.success,
  },
  dotNotReady: {
    backgroundColor: colors.danger,
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
  },
  labelReady: {
    color: colors.success,
  },
  labelNotReady: {
    color: colors.danger,
  },
});
