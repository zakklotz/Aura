import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchCallSession } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import { useCallStore } from "../store/callStore";
import { twilioVoiceService } from "../services/twilioVoice/twilioVoiceService";
import { colors } from "../theme/colors";

export function DialerScreen() {
  const { callState, voiceRegistrationState, externalParticipantE164, lastVoiceErrorCode } = useCallStore();
  const callSession = useQuery({ queryKey: queryKeys.callSession, queryFn: fetchCallSession });
  const [number, setNumber] = useState(externalParticipantE164 ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCall() {
    if (!number.trim() || isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      await twilioVoiceService.startOutgoingCall(number.trim());
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 28, fontWeight: "700", color: colors.text, marginBottom: 8 }}>Dialer</Text>
      <Text style={{ color: colors.muted, marginBottom: 16 }}>Voice readiness: {voiceRegistrationState}</Text>
      <Text style={{ color: colors.text, marginBottom: 16 }}>Call state: {callState}</Text>
      <Text style={{ color: colors.muted, marginBottom: 24 }}>
        Server session: {callSession.data?.session.state ?? "idle"}
      </Text>
      {lastVoiceErrorCode ? (
        <Text style={{ color: "#b42318", marginBottom: 16 }}>Last voice error: {lastVoiceErrorCode}</Text>
      ) : null}
      <TextInput
        value={number}
        onChangeText={setNumber}
        placeholder="+15555550123"
        keyboardType="phone-pad"
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: "#d0d5dd",
          borderRadius: 16,
          padding: 16,
          fontSize: 18,
          color: colors.text,
          marginBottom: 16,
          backgroundColor: "#fff",
        }}
      />
      <Pressable
        onPress={handleCall}
        disabled={isSubmitting || !number.trim()}
        style={{
          backgroundColor: isSubmitting || !number.trim() ? "#98a2b3" : colors.primary,
          borderRadius: 16,
          padding: 16,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
          {isSubmitting ? "Calling..." : "Place Call"}
        </Text>
      </Pressable>
    </View>
  );
}
