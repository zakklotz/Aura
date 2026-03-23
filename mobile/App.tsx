import React from "react";
import { Text, View } from "react-native";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import * as WebBrowser from "expo-web-browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { navigationRef } from "./src/navigation/navigationRef";
import { AppStateRefetcher } from "./src/components/AppStateRefetcher";
import { SocketBootstrap } from "./src/components/SocketBootstrap";
import { VoiceBootstrap } from "./src/components/VoiceBootstrap";
import { CallNavigationController } from "./src/components/CallNavigationController";
import { HistorySyncBootstrap } from "./src/components/HistorySyncBootstrap";
import { CommunicationCacheBootstrap } from "./src/components/CommunicationCacheBootstrap";
import { colors } from "./src/theme/colors";
import { setApiTokenGetter } from "./src/services/api/authTokenBridge";

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
const socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL ?? "";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
    },
  },
});

WebBrowser.maybeCompleteAuthSession();

function MissingConfig() {
  const checks = [
    {
      label: "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
      present: Boolean(clerkPublishableKey),
    },
    {
      label: "EXPO_PUBLIC_API_URL",
      present: Boolean(apiUrl),
    },
    {
      label: "EXPO_PUBLIC_SOCKET_URL",
      present: Boolean(socketUrl),
    },
  ];

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 24,
        backgroundColor: colors.background,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600", marginBottom: 8 }}>Missing config</Text>
      <Text style={{ color: colors.muted, marginBottom: 16 }}>
        Temporary startup diagnostics for Expo public env values:
      </Text>
      {checks.map((check) => (
        <Text key={check.label} style={{ color: check.present ? colors.success : colors.danger, marginBottom: 8 }}>
          {check.label}: {check.present ? "present" : "missing"}
        </Text>
      ))}
    </View>
  );
}

function AppShell() {
  const auth = useAuth();
  const isSignedIn = Boolean(auth.isSignedIn);
  const apiTokenGetter = React.useCallback(async () => {
    if (!auth.isLoaded || !auth.isSignedIn) {
      return null;
    }

    return (await auth.getToken()) ?? null;
  }, [auth.getToken, auth.isLoaded, auth.isSignedIn]);

  setApiTokenGetter(apiTokenGetter);

  React.useEffect(() => {
    return () => {
      setApiTokenGetter(null);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="dark" />
          {isSignedIn ? (
            <>
              <VoiceBootstrap queryClient={queryClient} isSignedIn={isSignedIn} />
              <CommunicationCacheBootstrap queryClient={queryClient} isSignedIn={isSignedIn} userId={auth.userId} />
              <AppStateRefetcher queryClient={queryClient} />
              <SocketBootstrap queryClient={queryClient} isSignedIn={isSignedIn} />
              <HistorySyncBootstrap queryClient={queryClient} isSignedIn={isSignedIn} />
              <CallNavigationController />
              <AppNavigator isSignedIn={isSignedIn} />
            </>
          ) : (
            <AppNavigator isSignedIn={isSignedIn} />
          )}
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  if (!clerkPublishableKey || !apiUrl) {
    return <MissingConfig />;
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <AppShell />
    </ClerkProvider>
  );
}
