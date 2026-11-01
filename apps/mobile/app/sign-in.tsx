import { ApiError, validateUsername } from "@imello/core";
import { router } from "expo-router";
import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePrefs } from "../src/prefs";
import { useSession } from "../src/session";
import { Body, Button, Card, Input, Title } from "../src/ui";

export default function SignIn() {
  const { t, locale, setLocale, colors, rtl } = usePrefs();
  const { signIn, register } = useSession();
  const [mode, setMode] = useState<"signIn" | "register">("signIn");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (mode === "register" && validateUsername(username.trim().toLowerCase())) return setError(t("auth.usernameHint"));
    setBusy(true);
    try {
      if (mode === "signIn") await signIn(username, password);
      else await register({ username: username.trim().toLowerCase(), password, displayName: displayName || username, locale });
      router.replace("/(tabs)/chats");
    } catch (err) {
      const code = err instanceof ApiError ? err.code : (err as Error).message;
      setError(code === "username_unavailable" ? t("auth.usernameTaken") : code === "M_FORBIDDEN" ? t("auth.invalidCredentials") : code === "rate_limited" || code === "M_LIMIT_EXCEEDED" ? t("auth.rateLimited") : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" onPress={() => setLocale(locale === "ar" ? "en" : "ar")} style={{ alignSelf: rtl ? "flex-start" : "flex-end", padding: 8 }}>
            <Text style={{ color: colors.accent, fontWeight: "600" }}>{locale === "ar" ? "English" : "العربية"}</Text>
          </Pressable>
          <View style={{ alignItems: "center", gap: 8 }}>
            <Image source={require("../assets/icon.png")} style={{ width: 88, height: 88, borderRadius: 20 }} accessibilityIgnoresInvertColors />
            <Title center>{t("app.name")}</Title>
            <Body muted center>{t("app.tagline")}</Body>
          </View>
          <Card>
            {mode === "register" && <Input label={t("auth.displayName")} value={displayName} onChangeText={setDisplayName} autoComplete="name" />}
            <Input label={t("auth.username")} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" />
            <Input label={t("auth.password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === "signIn" ? "current-password" : "new-password"} textContentType={mode === "signIn" ? "password" : "newPassword"} />
            {error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
            <Button title={mode === "signIn" ? t("auth.signIn") : t("auth.createAccount")} onPress={() => void submit()} busy={busy} />
            <Button variant="secondary" title={mode === "signIn" ? t("auth.createAccount") : t("auth.signIn")} onPress={() => setMode(mode === "signIn" ? "register" : "signIn")} />
          </Card>
          <Body muted center>{t("app.signature")}</Body>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
