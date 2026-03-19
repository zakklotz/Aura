import React from "react";
import { Pressable, Text, View } from "react-native";
import { useCallStore } from "../store/callStore";
import { twilioVoiceService } from "../services/twilioVoice/twilioVoiceService";
import { colors } from "../theme/colors";

export function ActiveCallScreen() {
  const { callState, voiceRegistrationState, externalParticipantE164, callSid, lastVoiceErrorMessage } = useCallStore();
  const isIncoming = callState === "incoming";
  const canHangUp = callState === "answering" || callState === "outgoing_dialing" || callState === "connecting" || callState === "active";

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, marginBottom: 12 }}>Active Call</Text>
      <Text style={{ color: colors.text, marginBottom: 8 }}>Call state: {callState}</Text>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>Voice readiness: {voiceRegistrationState}</Text>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>Participant: {externalParticipantE164 ?? "unknown"}</Text>
      <Text style={{ color: colors.muted, marginBottom: 16 }}>Call SID: {callSid ?? "pending"}</Text>
      {lastVoiceErrorMessage ? <Text style={{ color: "#b42318", marginBottom: 16 }}>{lastVoiceErrorMessage}</Text> : null}
      {isIncoming ? (
        <>
          <Pressable
            onPress={() => {
              void twilioVoiceService.acceptIncomingCall();
            }}
            style={{ backgroundColor: colors.primary, borderRadius: 16, padding: 16, marginBottom: 12 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>Answer</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void twilioVoiceService.rejectIncomingCall();
            }}
            style={{ backgroundColor: "#344054", borderRadius: 16, padding: 16 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>Decline</Text>
          </Pressable>
        </>
      ) : null}
      {canHangUp ? (
        <Pressable
          onPress={() => {
            void twilioVoiceService.disconnectActiveCall();
          }}
          style={{ backgroundColor: "#b42318", borderRadius: 16, padding: 16 }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>Hang Up</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
