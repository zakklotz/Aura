import { useEffect } from "react";
import { AppState } from "react-native";
import type { QueryClient } from "@tanstack/react-query";
import { refreshOnAppActive } from "../services/query/communicationRefresh";

export function AppStateRefetcher({ queryClient }: { queryClient: QueryClient }) {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshOnAppActive(queryClient);
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  return null;
}
