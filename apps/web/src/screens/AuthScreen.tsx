import { ApiError, MIN_PASSWORD_LENGTH, validateUsername } from "@imello/core";
import { useState, type FormEvent } from "react";
import { usePrefs } from "../lib/prefs";
import { useSession } from "../lib/session";
import { Button, Field, Logo } from "../ui/components";

export function AuthScreen() {
  const { t, locale, setLocale } = usePrefs();
  const { signIn, register, notice } = useSession();
  const [mode, setMode] = useState<"signIn" | "register">("signIn");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [temporary, setTemporary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "register") {
      if (validateUsername(username.trim().toLowerCase())) return setError(t("auth.usernameHint"));
      if (password.length < MIN_PASSWORD_LENGTH) return setError(t("auth.passwordHint"));
    }
    setBusy(true);
    try {
      if (mode === "signIn") await signIn(username, password, temporary);
      else await register({ username: username.trim().toLowerCase(), password, displayName: displayName || username, locale }, temporary);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : (err as { errcode?: string }).errcode;
      const status = err instanceof ApiError ? err.status : (err as { httpStatus?: number }).httpStatus;
      if (code === "username_unavailable") setError(t("auth.usernameTaken"));
      else if (code?.startsWith("username_")) setError(t("auth.usernameHint"));
      else if (code === "M_FORBIDDEN" || status === 403) setError(t("auth.invalidCredentials"));
      else if (status === 429 || code === "rate_limited" || code === "M_LIMIT_EXCEEDED") setError(t("auth.rateLimited"));
      else setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-lang">
        <button className="link" onClick={() => setLocale(locale === "ar" ? "en" : "ar")} lang={locale === "ar" ? "en" : "ar"}>
          {locale === "ar" ? "English" : "العربية"}
        </button>
      </div>
      <div className="auth-card">
        <div className="auth-brand">
          <Logo size={72} />
          <h1>{t("app.name")}</h1>
          <p className="tagline">{t("app.tagline")}</p>
        </div>
        {notice && <p className="notice" role="status">{notice}</p>}
        <form onSubmit={submit} noValidate>
          <h2>{mode === "signIn" ? t("auth.signIn") : t("auth.createAccount")}</h2>
          {mode === "register" && (
            <Field label={t("auth.displayName")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" maxLength={64} />
          )}
          <Field
            label={t("auth.username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            required
            hint={mode === "register" ? t("auth.usernameHint") : undefined}
            name="username"
          />
          <Field
            label={t("auth.password")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            dir="ltr"
            required
            hint={mode === "register" ? t("auth.passwordHint") : undefined}
            name="password"
          />
          <label className="check">
            <input type="checkbox" checked={temporary} onChange={(e) => setTemporary(e.target.checked)} />
            <span>
              {t("auth.temporarySession")}
              {temporary && <small>{t("auth.temporarySessionHint")}</small>}
            </span>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <Button type="submit" busy={busy} className="wide">
            {busy ? t("common.loading") : mode === "signIn" ? t("auth.signIn") : t("auth.createAccount")}
          </Button>
        </form>
        <p className="auth-switch">
          {mode === "signIn" ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
          <button className="link" onClick={() => { setMode(mode === "signIn" ? "register" : "signIn"); setError(null); }}>
            {mode === "signIn" ? t("auth.createAccount") : t("auth.signIn")}
          </button>
        </p>
      </div>
      <footer className="signature">{t("app.signature")}</footer>
    </main>
  );
}
