import { ApiError, MIN_PASSWORD_LENGTH, validateUsername } from "@imello/core";
import { useEffect, useState, type FormEvent } from "react";
import { usePrefs } from "../lib/prefs";
import { useSession } from "../lib/session";
import { Button, Field, Logo } from "../ui/components";

type Mode = "start" | "signIn" | "register";

export function AuthScreen() {
  const { t, locale, setLocale } = usePrefs();
  const { signIn, register, quickStart, notice, api } = useSession();
  const [mode, setMode] = useState<Mode>("start");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [temporary, setTemporary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverDown, setServerDown] = useState(false);

  useEffect(() => {
    api.config().then(() => setServerDown(false), () => setServerDown(true));
  }, [api]);

  function explain(err: unknown) {
    const code = err instanceof ApiError ? err.code : (err as { errcode?: string }).errcode;
    const status = err instanceof ApiError ? err.status : (err as { httpStatus?: number }).httpStatus;
    if (code === "username_unavailable") return t("auth.usernameTaken");
    if (code?.startsWith("username_")) return t("auth.usernameHint");
    if (code === "M_FORBIDDEN" || status === 403) return t("auth.invalidCredentials");
    if (status === 429 || code === "rate_limited" || code === "M_LIMIT_EXCEEDED") return t("auth.rateLimited");
    if (code?.startsWith("password_")) return t("auth.passwordHint");
    if (code === "display_name_invalid") return t("auth.displayNameInvalid");
    if (code === "M_USER_IN_USE") return t("auth.usernameTaken");
    // fetch() rejects with a TypeError when the server can't be reached at all.
    if (err instanceof TypeError || (status === undefined && !code)) return t("auth.networkError");
    if (status !== undefined && status >= 500) return t("auth.serverError");
    return t("common.error");
  }

  async function run(action: () => Promise<void>) {
    if (busy) return; // no double submissions
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "start") return void run(() => quickStart(displayName, locale));
    if (mode === "register") {
      if (validateUsername(username.trim().toLowerCase())) return setError(t("auth.usernameHint"));
      if (password.length < MIN_PASSWORD_LENGTH) return setError(t("auth.passwordHint"));
      return void run(() =>
        register({ username: username.trim().toLowerCase(), password, displayName: displayName || username, locale }, temporary),
      );
    }
    void run(() => signIn(username, password, temporary));
  }

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
  };

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
        {serverDown && <p className="notice" role="status">{t("auth.serverUnavailable")}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        <form onSubmit={submit} noValidate>
          {mode === "start" ? (
            <>
              <Field label={t("auth.yourName")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" maxLength={64} />
              <Button type="submit" busy={busy} className="wide big">
                {busy ? t("common.loading") : t("auth.startNow")}
              </Button>
              <p className="muted center small">{t("auth.startNowHint")}</p>
            </>
          ) : (
            <>
              <h2>{mode === "signIn" ? t("auth.signIn") : t("auth.createAccount")}</h2>
              {mode === "register" && (
                <Field label={t("auth.displayName")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" maxLength={64} />
              )}
              <Field
                label={mode === "signIn" ? t("auth.usernameOrNumber") : t("auth.username")}
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
              <Button type="submit" busy={busy} className="wide">
                {busy ? t("common.loading") : mode === "signIn" ? t("auth.signIn") : t("auth.createAccount")}
              </Button>
            </>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </form>

        <div className="auth-switch">
          {mode !== "start" && (
            <button className="link" onClick={() => switchTo("start")}>{t("auth.startNow")}</button>
          )}
          {mode !== "signIn" && (
            <p>
              {t("auth.haveNumber")}{" "}
              <button className="link" onClick={() => switchTo("signIn")}>{t("auth.signIn")}</button>
            </p>
          )}
          {mode !== "register" && (
            <button className="link subtle" onClick={() => switchTo("register")}>{t("auth.createWithUsername")}</button>
          )}
        </div>
      </div>
      <footer className="signature">{t("app.signature")}</footer>
    </main>
  );
}
