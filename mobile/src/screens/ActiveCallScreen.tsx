import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useCallStore } from "../store/callStore";
import { twilioVoiceService } from "../services/twilioVoice/twilioVoiceService";
import { colors } from "../theme/colors";

export function ActiveCallScreen() {
  const { callState, externalParticipantE164 } = useCallStore();
  const isIncoming = callState === "incoming";
  const canHangUp = callState === "answering" || callState === "outgoing_dialing" || callState === "connecting" || callState === "active";

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{isIncoming ? "Incoming call" : "Call in progress"}</Text>
      <Text style={styles.participant}>{externalParticipantE164 ?? "Unknown caller"}</Text>
      {isIncoming ? (
        <>
          <Pressable
            onPress={() => {
              void twilioVoiceService.acceptIncomingCall();
            }}
            style={[styles.button, styles.answerButton]}
          >
            <Text style={styles.buttonLabel}>Answer</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void twilioVoiceService.rejectIncomingCall();
            }}
            style={[styles.button, styles.secondaryButton]}
          >
            <Text style={styles.buttonLabel}>Decline</Text>
          </Pressable>
        </>
      ) : null}
      {canHangUp ? (
        <Pressable
          onPress={() => {
            void twilioVoiceService.disconnectActiveCall();
          }}
          style={[styles.button, styles.hangupButton]}
        >
          <Text style={styles.buttonLabel}>Hang up</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    backgroundColor: colors.background,
    justifyContent: "center",
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  participant: {
    color: colors.muted,
    fontSize: 18,
    marginBottom: 12,
  },
  button: {
    borderRadius: 16,
    padding: 16,
  },
  answerButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: "#344054",
  },
  hangupButton: {
    backgroundColor: "#b42318",
  },
  buttonLabel: {
    color: colors.surface,
    fontWeight: "700",
    textAlign: "center",
  },
});
