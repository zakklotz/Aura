import { useEffect } from "react";
import { AppState } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { fetchBootstrap } from "../services/api/softphoneApi";
import { queryKeys } from "../store/queryKeys";
import { twilioVoiceService } from "../services/twilioVoice/twilioVoiceService";

export function VoiceBootstrap({
  queryClient,
  isSignedIn,
}: {
  queryClient: QueryClient;
  isSignedIn: boolean;
}) {
  const bootstrap = useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: fetchBootstrap,
    enabled: isSignedIn,
  });

  useEffect(() => {
    if (isSignedIn && bootstrap.isLoading) {
      return;
    }

    void twilioVoiceService.bootstrap({
      isSignedIn,
      bootstrap: bootstrap.data,
      queryClient,
    });
  }, [bootstrap.data, bootstrap.isLoading, isSignedIn, queryClient]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void twilioVoiceService.handleAppActive();
      }
    });
    return () => subscription.remove();
  }, []);

  return null;
}
