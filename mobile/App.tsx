import React from "react";
import { Text, View } from "react-native";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
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
import { colors } from "./src/theme/colors";

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const queryClient = new QueryClient();

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, token: string) {
    await SecureStore.setItemAsync(key, token);
  },
};

function MissingConfig() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: colors.background,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600", marginBottom: 8 }}>Missing config</Text>
      <Text style={{ color: colors.muted, textAlign: "center" }}>
        Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_API_URL` before running the mobile app.
      </Text>
    </View>
  );
}

function AppShell() {
  const auth = useAuth();
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="dark" />
          <AppStateRefetcher queryClient={queryClient} />
          <SocketBootstrap queryClient={queryClient} isSignedIn={Boolean(auth.isSignedIn)} />
          <VoiceBootstrap queryClient={queryClient} isSignedIn={Boolean(auth.isSignedIn)} />
          <CallNavigationController />
          <AppNavigator isSignedIn={Boolean(auth.isSignedIn)} />
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  if (!clerkPublishableKey || !process.env.EXPO_PUBLIC_API_URL) {
    return <MissingConfig />;
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <AppShell />
    </ClerkProvider>
  );
}
