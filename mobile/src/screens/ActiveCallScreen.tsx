import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useCallStore } from "../store/callStore";
import { twilioVoiceService } from "../services/twilioVoice/twilioVoiceService";
import { colors } from "../theme/colors";

function callStateLabel(callState: ReturnType<typeof useCallStore.getState>["callState"]) {
  switch (callState) {
    case "outgoing_dialing":
      return "Dialing";
    case "connecting":
      return "Connecting";
    case "active":
      return "Connected";
    case "answering":
      return "Answering";
    case "incoming":
      return "Incoming";
    default:
      return "Call";
  }
}

export function ActiveCallScreen() {
  const { callState, externalParticipantE164, isMuted, isSpeakerOn } = useCallStore();
  const isIncoming = callState === "incoming";
  const canHangUp = callState === "answering" || callState === "outgoing_dialing" || callState === "connecting" || callState === "active";
  const canUseInCallControls = callState === "answering" || callState === "outgoing_dialing" || callState === "connecting" || callState === "active";

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{isIncoming ? "Incoming call" : "Call in progress"}</Text>
      <Text style={styles.participant}>{externalParticipantE164 ?? "Unknown caller"}</Text>
      <Text style={styles.status}>{callStateLabel(callState)}</Text>
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
      {!isIncoming && canUseInCallControls ? (
        <View style={styles.controlsRow}>
          <Pressable
            onPress={() => {
              void twilioVoiceService.setMuted(!isMuted);
            }}
            style={[styles.controlButton, isMuted && styles.controlButtonActive]}
          >
            <Ionicons name={isMuted ? "mic-off" : "mic"} size={18} color={isMuted ? colors.surface : colors.text} />
            <Text style={[styles.controlButtonLabel, isMuted && styles.controlButtonLabelActive]}>
              {isMuted ? "Muted" : "Mute"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void twilioVoiceService.setSpeakerEnabled(!isSpeakerOn);
            }}
            style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive]}
          >
            <Ionicons name={isSpeakerOn ? "volume-high" : "volume-medium"} size={18} color={isSpeakerOn ? colors.surface : colors.text} />
            <Text style={[styles.controlButtonLabel, isSpeakerOn && styles.controlButtonLabelActive]}>
              {isSpeakerOn ? "Speaker on" : "Speaker"}
            </Text>
          </Pressable>
        </View>
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
  },
  status: {
    color: colors.muted,
    fontSize: 15,
    marginBottom: 12,
  },
  controlsRow: {
    flexDirection: "row",
    gap: 12,
  },
  controlButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  controlButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  controlButtonLabel: {
    color: colors.text,
    fontWeight: "700",
  },
  controlButtonLabelActive: {
    color: colors.surface,
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
