import React from "react";
import { Text, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import type { MainTabParamList, RootStackParamList } from "./types";
import { queryKeys } from "../store/queryKeys";
import { fetchBootstrap } from "../services/api/softphoneApi";
import { MessagesScreen } from "../screens/MessagesScreen";
import { DialerScreen } from "../screens/DialerScreen";
import { ContactsScreen } from "../screens/ContactsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { ThreadDetailScreen } from "../screens/ThreadDetailScreen";
import { MailboxScreen } from "../screens/MailboxScreen";
import { ContactCardScreen } from "../screens/ContactCardScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { ActiveCallScreen } from "../screens/ActiveCallScreen";
import { SignInScreen } from "../screens/SignInScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen name="Messages" component={MessagesScreen} />
      <Tabs.Screen name="Dialer" component={DialerScreen} />
      <Tabs.Screen name="Contacts" component={ContactsScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

export function AppNavigator({ isSignedIn }: { isSignedIn: boolean }) {
  const bootstrapQuery = useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: fetchBootstrap,
    enabled: isSignedIn,
  });

  if (!isSignedIn) {
    return (
      <Stack.Navigator>
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    );
  }

  if (bootstrapQuery.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Loading…</Text>
      </View>
    );
  }

  const onboardingRequired =
    bootstrapQuery.data?.business?.onboardingState != null &&
    bootstrapQuery.data.business.onboardingState !== "COMPLETE";

  return (
    <Stack.Navigator>
      {onboardingRequired ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ title: "Set up Aura" }} />
      ) : (
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      )}
      <Stack.Screen name="ThreadDetail" component={ThreadDetailScreen} options={({ route }) => ({ title: route.params.title })} />
      <Stack.Screen name="Mailbox" component={MailboxScreen} />
      <Stack.Screen name="ContactCard" component={ContactCardScreen} options={{ title: "Contact" }} />
      <Stack.Screen name="ActiveCall" component={ActiveCallScreen} options={{ presentation: "modal", title: "Active Call" }} />
    </Stack.Navigator>
  );
}
