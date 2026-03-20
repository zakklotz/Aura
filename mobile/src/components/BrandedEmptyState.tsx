import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

const heroImage = require("../../assets/approved-original-1024.png");

export function BrandedEmptyState({ title, description, actionLabel, onActionPress }: Props) {
  return (
    <View style={styles.container}>
      <Image source={heroImage} style={styles.image} resizeMode="contain" />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} style={styles.button}>
          <Text style={styles.buttonLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 12,
  },
  image: {
    width: 96,
    height: 96,
    borderRadius: 24,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  button: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonLabel: {
    color: colors.surface,
    fontWeight: "700",
  },
});
