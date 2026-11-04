import { ApiError, MIN_PASSWORD_LENGTH, validateUsername } from "@imello/core";
import { translate, type MessageKey } from "@imello/localization";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { RpcError } from "../../src/rpc/protocol";
import { Field, PrimaryButton } from "../../src/ui/chrome";
import { usePrefs } from "../../src/prefs/Prefs";
import { useSession } from "../../src/session/Session";

type Mode = "start" | "signIn" | "register";

function explain(err: unknown, locale: "en" | "ar"): string {
  const code = err instanceof ApiError ? err.code : err instanceof RpcError ? err.code : (err as { errcode?: string }).errcode;
  const status = err instanceof ApiError ? err.status : (err as { httpStatus?: number }).httpStatus;
  const key: MessageKey =
    code === "username_unavailable" || code === "M_USER_IN_USE" ? "auth.usernameTaken"
    : code?.startsWith("username_") ? "auth.usernameHint"
    : code === "M_FORBIDDEN" || status === 403 ? "auth.invalidCredentials"
    : status === 429 || code === "rate_limited" || code === "M_LIMIT_EXCEEDED" ? "auth.rateLimited"
    : code?.startsWith("password_") ? "auth.passwordHint"
    : code === "display_name_invalid" ? "auth.displayNameInvalid"
    : err instanceof TypeError || (status === undefined && !code) ? "auth.networkError"
    : typeof status === "number" && status >= 500 ? "auth.serverError"
    : "common.error";
  return translate(locale, key);
}

export default function SignIn() {
  const { colors, font, t, locale, setLocale } = usePrefs();
  const { signIn, register, quickStart, api } = useSession();
  const [mode, setMode] = useState<Mode>("start");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let live = true;
    const check = () => {
      void api.config().then(
        () => live && setDown(false),
        () => {
          if (!live) return;
          setDown(true);
          setTimeout(check, 8000);
        },
      );
    };
    check();
    return () => {
      live = false;
    };
  }, [api]);

  useEffect(() => {
    if (!busy) return setSlow(false);
    const id = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(id);
  }, [busy]);

  async function submit() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === "start") await quickStart(name);
      else if (mode === "register") {
        const user = username.trim().toLowerCase();
        if (validateUsername(user)) return setError(t("tooShort"));
        if (password.length < MIN_PASSWORD_LENGTH) return setError(t("tooShort"));
        await register({ username: user, password, displayName: name || user }, false);
      } else {
        await signIn(username, password, false);
      }
    } catch (err) {
      setError(explain(err, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: "center", gap: 14 }}>
      <StatusBar style={colors.dark ? "light" : "dark"} />
      <Pressable onPress={() => setLocale(locale === "ar" ? "en" : "ar")} style={{ alignSelf: "flex-end" }}>
        <Text style={{ color: colors.primary, fontFamily: font("600") }}>{locale === "ar" ? t("english") : t("arabic")}</Text>
      </Pressable>
      <View style={{ alignItems: "center", gap: 6, marginBottom: 8 }}>
        <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: colors.primaryFill, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 10, height: 28, borderRadius: 5, backgroundColor: "#fff" }} />
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#F2B640", marginTop: 4 }} />
        </View>
        <Text style={{ fontFamily: font("700"), fontSize: 32, color: colors.text }}>iMello</Text>
        <Text style={{ fontFamily: font("400"), fontSize: 16, color: colors.text2 }}>{t("tagline")}</Text>
      </View>
      {down ? <Text style={{ color: colors.statusFailed, fontFamily: font("400"), textAlign: "center" }}>{t("serverDown")}</Text> : null}
      {mode !== "signIn" ? <Field value={name} onChangeText={setName} placeholder={t("yourName")} /> : null}
      {mode !== "start" ? (
        <>
          <Field value={username} onChangeText={setUsername} placeholder={mode === "signIn" ? t("codeTitle") : t("username")} ltr />
          <Field value={password} onChangeText={setPassword} placeholder={t("password")} secure ltr />
        </>
      ) : (
        <Text style={{ color: colors.text2, fontFamily: font("400"), textAlign: "center" }}>{t("startHint")}</Text>
      )}
      {error ? <Text style={{ color: colors.statusFailed, fontFamily: font("500"), textAlign: "center" }}>{error}</Text> : null}
      {slow ? <Text style={{ color: colors.text2, fontFamily: font("400"), textAlign: "center" }}>{t("comingUp")}</Text> : null}
      <PrimaryButton label={mode === "start" ? t("startNow") : mode === "register" ? t("createUser") : t("signIn")} onPress={() => void submit()} busy={busy} />
      <Pressable onPress={() => setMode(mode === "signIn" ? "start" : "signIn")}>
        <Text style={{ color: colors.primary, fontFamily: font("600"), textAlign: "center" }}>{mode === "signIn" ? t("newHere") : t("haveCode")}</Text>
      </Pressable>
      {mode !== "register" ? (
        <Pressable onPress={() => setMode("register")}>
          <Text style={{ color: colors.text2, fontFamily: font("500"), textAlign: "center" }}>{t("createUser")}</Text>
        </Pressable>
      ) : null}
    </KeyboardAwareScrollView>
  );
}
