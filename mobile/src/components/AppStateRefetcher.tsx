import { useEffect } from "react";
import { AppState } from "react-native";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../store/queryKeys";

export function AppStateRefetcher({ queryClient }: { queryClient: QueryClient }) {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
        queryClient.invalidateQueries({ queryKey: queryKeys.threads });
        queryClient.invalidateQueries({ queryKey: queryKeys.mailbox });
        queryClient.invalidateQueries({ queryKey: queryKeys.callSession });
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  return null;
}
