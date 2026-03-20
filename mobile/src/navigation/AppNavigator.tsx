import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MainTabParamList, RootStackParamList } from "./types";
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
import { colors } from "../theme/colors";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          height: 62 + Math.max(insets.bottom, 10),
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 10),
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconName =
            route.name === "Inbox"
              ? focused
                ? "chatbubbles"
                : "chatbubbles-outline"
              : route.name === "Phone"
                ? focused
                  ? "call"
                  : "call-outline"
                : route.name === "Contacts"
                  ? focused
                    ? "people"
                    : "people-outline"
                  : focused
                    ? "settings"
                    : "settings-outline";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Inbox" component={MessagesScreen} />
      <Tabs.Screen name="Phone" component={DialerScreen} />
      <Tabs.Screen name="Contacts" component={ContactsScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

export function AppNavigator({ isSignedIn }: { isSignedIn: boolean }) {
  if (!isSignedIn) {
    return (
      <Stack.Navigator>
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ title: "Set up Aura" }} />
      <Stack.Screen name="ThreadDetail" component={ThreadDetailScreen} options={({ route }) => ({ title: route.params.title })} />
      <Stack.Screen name="Mailbox" component={MailboxScreen} />
      <Stack.Screen
        name="ContactCard"
        component={ContactCardScreen}
        options={({ route }) => ({
          title: route.params?.contactId ? "Edit Contact" : "Add Contact",
        })}
      />
      <Stack.Screen name="ActiveCall" component={ActiveCallScreen} options={{ presentation: "modal", title: "Active Call" }} />
    </Stack.Navigator>
  );
}
