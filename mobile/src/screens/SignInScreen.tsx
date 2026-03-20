import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth, useClerk, useSSO } from "@clerk/expo";
import { useSignIn } from "@clerk/expo/legacy";
import { colors } from "../theme/colors";

function readErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Something went wrong. Please try again.";
  }

  const maybeClerkError = error as {
    errors?: Array<{
      longMessage?: string;
      message?: string;
    }>;
    message?: string;
  };

  const primary = maybeClerkError.errors?.[0];
  if (primary?.longMessage) {
    return primary.longMessage;
  }
  if (primary?.message) {
    return primary.message;
  }
  if (maybeClerkError.message) {
    return maybeClerkError.message;
  }
  return "Something went wrong. Please try again.";
}

export function SignInScreen() {
  const { isLoaded: isAuthLoaded } = useAuth();
  const { signIn, isLoaded: isSignInLoaded } = useSignIn();
  const { setActive } = useClerk();
  const { startSSOFlow } = useSSO();

  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const isReady = isAuthLoaded && isSignInLoaded;
  const trimmedEmail = useMemo(() => emailAddress.trim(), [emailAddress]);

  async function handleEmailPasswordSignIn() {
    if (!isReady || !signIn) {
      return;
    }

    if (!trimmedEmail || !password) {
      setErrorMessage("Enter your email address and password.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const attempt = await signIn.create({
        strategy: "password",
        identifier: trimmedEmail,
        password,
      });

      if (attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        return;
      }

      setErrorMessage("This account needs an additional sign-in step that is not configured in this mobile flow yet.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!isReady) {
      return;
    }

    setErrorMessage(null);
    setIsGoogleSubmitting(true);

    try {
      const { createdSessionId } = await startSSOFlow({
        strategy: "oauth_google",
      });

      if (createdSessionId) {
        await setActive({ session: createdSessionId });
        return;
      }

      setErrorMessage("Google sign-in was cancelled or did not finish. Please try again.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error));
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading sign-in…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Aura</Text>
          <Text style={styles.title}>Sign in to your softphone workspace</Text>
          <Text style={styles.subtitle}>
            Continue with Google or use the email address and password tied to your Clerk account.
          </Text>
        </View>

        <View style={styles.formCard}>
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={isGoogleSubmitting || isSubmitting}
            style={({ pressed }) => [
              styles.googleButton,
              (isGoogleSubmitting || isSubmitting) && styles.buttonDisabled,
              pressed && !isGoogleSubmitting && !isSubmitting ? styles.buttonPressed : null,
            ]}
          >
            {isGoogleSubmitting ? <ActivityIndicator color={colors.text} /> : <Text style={styles.googleButtonText}>Continue with Google</Text>}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerLabel}>or sign in with email</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              value={emailAddress}
              onChangeText={setEmailAddress}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="you@company.com"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
              placeholder="Enter your password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
            />
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable
            onPress={handleEmailPasswordSignIn}
            disabled={isSubmitting || isGoogleSubmitting}
            style={({ pressed }) => [
              styles.primaryButton,
              (isSubmitting || isGoogleSubmitting) && styles.buttonDisabled,
              pressed && !isSubmitting && !isGoogleSubmitting ? styles.buttonPressed : null,
            ]}
          >
            {isSubmitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
          </Pressable>

          <Text style={styles.footnote}>
            Google sign-in requires Google OAuth to be enabled for this Clerk app. Email and password uses Clerk&apos;s existing
            password sign-in strategy.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    gap: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 12,
    padding: 24,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 15,
  },
  heroCard: {
    backgroundColor: colors.text,
    borderRadius: 24,
    padding: 24,
    gap: 10,
  },
  eyebrow: {
    color: "#bfdbfe",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    color: colors.surface,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
  },
  subtitle: {
    color: "#d1d5db",
    fontSize: 16,
    lineHeight: 22,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fbfbfc",
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  footnote: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
});
