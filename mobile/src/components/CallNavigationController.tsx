import { useEffect } from "react";
import { navigationRef } from "../navigation/navigationRef";
import { useCallStore } from "../store/callStore";

const PRESENTED_CALL_STATES = new Set(["incoming", "answering", "outgoing_dialing", "connecting", "active"]);

export function CallNavigationController() {
  const callState = useCallStore((state) => state.callState);

  useEffect(() => {
    const syncNavigation = () => {
      if (!navigationRef.isReady()) {
        return false;
      }

      const currentRoute = navigationRef.getCurrentRoute()?.name;
      if (PRESENTED_CALL_STATES.has(callState)) {
        if (currentRoute !== "ActiveCall") {
          navigationRef.navigate("ActiveCall");
        }
        return true;
      }

      if (currentRoute === "ActiveCall" && navigationRef.canGoBack()) {
        navigationRef.goBack();
      }
      return true;
    };

    if (syncNavigation()) {
      return;
    }

    const interval = setInterval(() => {
      if (syncNavigation()) {
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [callState]);

  return null;
}
