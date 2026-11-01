import { MIN_PASSWORD_LENGTH } from "@imello/core";
import { exportKeysToFile, importKeysFromFile, listDevices, revokeDevice, WrongPassphraseError, type DeviceInfo } from "@imello/core/messaging";
import { inApp } from "../lib/notifications";
import { formatDay } from "@imello/localization";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  disableNotifications,
  enableNotifications,
  notificationsEnabled,
  notificationsSupported,
  previewEnabled,
  setPreviewEnabled,
} from "../lib/notifications";
import { usePrefs, type ThemePref } from "../lib/prefs";
import { useSession } from "../lib/session";
import { Button, Card, Field, LockBadge } from "../ui/components";

const VERSION = "1.0.0";

export function SettingsScreen() {
  const { t, locale, setLocale, theme, setTheme } = usePrefs();
  const { client, api, me, signOut, forget, temporary, deviceSecret, protectAccount } = useSession();
  const unprotected = me?.credential === "device";
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [protectMsg, setProtectMsg] = useState<string | null>(null);
  const [copiedPin, setCopiedPin] = useState(false);
  const [notifyOn, setNotifyOn] = useState(notificationsEnabled);
  const [bkPass, setBkPass] = useState("");
  const [bkPass2, setBkPass2] = useState("");
  const [bkMsg, setBkMsg] = useState<string | null>(null);
  const [bkBusy, setBkBusy] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);

  function saveText(name: string, text: string) {
    if (inApp()) {
      window.ReactNativeWebView!.postMessage(JSON.stringify({ type: "saveFile", name, content: text }));
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function makeBackup() {
    if (!client) return;
    setBkMsg(null);
    if (bkPass.length < MIN_PASSWORD_LENGTH) return setBkMsg(t("auth.passwordHint"));
    if (bkPass !== bkPass2) return setBkMsg(t("protect.mismatch"));
    setBkBusy(true);
    try {
      const file = await exportKeysToFile(client, bkPass);
      saveText(`imello-backup-${new Date().toISOString().slice(0, 10)}.txt`, file);
      setBkPass("");
      setBkPass2("");
      setBkMsg(t("backup.saved"));
    } catch {
      setBkMsg(t("common.error"));
    } finally {
      setBkBusy(false);
    }
  }

  async function restore(file: File) {
    if (!client) return;
    const pass = prompt(t("backup.enterPass"));
    if (!pass) return;
    setBkBusy(true);
    setBkMsg(null);
    try {
      const n = await importKeysFromFile(client, await file.text(), pass);
      setBkMsg(t("backup.restored", { n }));
    } catch (err) {
      setBkMsg(err instanceof WrongPassphraseError ? t("backup.wrongPass") : t("common.error"));
    } finally {
      setBkBusy(false);
    }
  }
  const [preview, setPreview] = useState(previewEnabled);

  /** Password for user-interactive auth: the device secret for unprotected accounts, otherwise ask. */
  async function accountPassword(question: string): Promise<string | null> {
    if (unprotected) return deviceSecret();
    return prompt(question);
  }

  async function protect() {
    setError(null);
    setProtectMsg(null);
    if (pw1.length < MIN_PASSWORD_LENGTH) return setError(t("auth.passwordHint"));
    if (pw1 !== pw2) return setError(t("protect.mismatch"));
    try {
      await protectAccount(pw1);
      setPw1("");
      setPw2("");
      setProtectMsg(t("protect.done"));
    } catch {
      setError(t("common.error"));
    }
  }

  async function confirmSignOut() {
    if (unprotected && !confirm(`${t("protect.title")}\n\n${t("protect.body")}`)) return;
    await signOut();
  }
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (client) void listDevices(client).then(setDevices).catch(() => setError(t("common.error")));
  }, [client, t]);
  useEffect(load, [load]);

  async function revoke(d: DeviceInfo) {
    if (!client) return;
    if (!confirm(`${t("settings.signOutDevice")}: ${d.displayName ?? d.deviceId}?`)) return;
    const password = await accountPassword(t("auth.password"));
    if (!password) return;
    try {
      await revokeDevice(client, d.deviceId, password);
      load();
    } catch {
      setError(t("auth.invalidCredentials"));
    }
  }

  async function exportData() {
    const data = await api.exportMe();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "imello-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    if (!client) return;
    if (unprotected && !confirm(t("settings.deleteAccountConfirm"))) return;
    const password = await accountPassword(t("settings.deleteAccountConfirm"));
    if (!password) return;
    try {
      // 1) Remove iMello policy data (immediately isolates the account), 2) deactivate on the homeserver and erase.
      await api.deleteMe();
      await client.deactivateAccount({ type: "m.login.password", identifier: { type: "m.id.user", user: client.getSafeUserId() }, password } as never, true);
      await forget();
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <div className="page">
      <header className="pane-header"><h1>{t("settings.title")}</h1></header>
      {error && <p className="error" role="alert">{error}</p>}

      <Card>
        <h2>{me?.displayName}</h2>
        {me?.pin ? (
          <div className="pin-card">
            <span className="muted small">{t("me.yourNumber")}</span>
            <strong className="pin" dir="ltr" data-testid="my-pin">{me.pin}</strong>
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(me.pin!).then(() => setCopiedPin(true))}>
              {copiedPin ? t("common.copied") : t("common.copy")}
            </Button>
            <p className="muted small">{t("me.shareNumber")}</p>
          </div>
        ) : (
          <p className="muted" dir="ltr">{me?.userId}</p>
        )}
        {temporary && <p className="notice">{t("auth.temporarySessionHint")}</p>}
      </Card>

      {(unprotected || protectMsg) && (
        <Card className="protect-card">
          <h2>🔐 {t("protect.title")}</h2>
          {protectMsg ? (
            <p className="notice" role="status">{protectMsg}</p>
          ) : (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void protect();
              }}
            >
              <p className="muted">{t("protect.body")}</p>
              <input type="text" name="username" autoComplete="username" value={me?.pin ?? ""} readOnly hidden />
              <Field label={t("protect.newPassword")} type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" dir="ltr" hint={t("auth.passwordHint")} />
              <Field label={t("protect.confirm")} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" dir="ltr" />
              <Button type="submit">{t("protect.title")}</Button>
            </form>
          )}
        </Card>
      )}

      <Card>
        <h2>{t("settings.language")}</h2>
        <div className="segmented" role="radiogroup" aria-label={t("settings.language")}>
          <button role="radio" aria-checked={locale === "en"} onClick={() => setLocale("en")} lang="en">English</button>
          <button role="radio" aria-checked={locale === "ar"} onClick={() => setLocale("ar")} lang="ar">العربية</button>
        </div>
        <h2>{t("settings.theme")}</h2>
        <div className="segmented" role="radiogroup" aria-label={t("settings.theme")}>
          {(["system", "light", "dark"] as ThemePref[]).map((v) => (
            <button key={v} role="radio" aria-checked={theme === v} onClick={() => setTheme(v)}>{t(`settings.theme.${v}`)}</button>
          ))}
        </div>
      </Card>

      <Card>
        <h2>🔔 {t("notify.title")}</h2>
        {notificationsSupported() ? (
          <>
            <div className="segmented" role="radiogroup" aria-label={t("notify.title")}>
              <button role="radio" aria-checked={notifyOn} onClick={() => void enableNotifications().then(setNotifyOn)}>{t("notify.on")}</button>
              <button role="radio" aria-checked={!notifyOn} onClick={() => { disableNotifications(); setNotifyOn(false); }}>{t("notify.off")}</button>
            </div>
            <label className="check">
              <input type="checkbox" checked={preview} onChange={(e) => { setPreviewEnabled(e.target.checked); setPreview(e.target.checked); }} />
              <span>
                {t("notify.preview")}
                <small>{t("notify.previewHint")}</small>
              </span>
            </label>
            <p className="muted small">{t("notify.limit")}</p>
          </>
        ) : (
          <p className="muted">{t("notify.unsupported")}</p>
        )}
      </Card>

      <Card>
        <h2>{t("settings.devices")}</h2>
        <ul className="contact-list" role="list">
          {devices.map((d) => (
            <li key={d.deviceId} className="contact-row" data-testid="device">
              <span className="device-icon" aria-hidden="true">{/iOS|Android/.test(d.displayName ?? "") ? "📱" : "💻"}</span>
              <span className="contact-main">
                <strong>{d.displayName ?? d.deviceId}</strong>
                <small className="muted">
                  {d.isCurrent ? t("settings.thisDevice") : d.lastSeenTs ? formatDay(new Date(d.lastSeenTs), locale) : ""}
                  {d.verified ? " · ✓" : ""}
                </small>
              </span>
              {!d.isCurrent && <Button variant="ghost" onClick={() => void revoke(d)}>{t("settings.signOutDevice")}</Button>}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2>💾 {t("backup.title")}</h2>
        <p className="muted">{t("backup.body")}</p>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void makeBackup(); }}>
          <Field label={t("backup.pass")} type="password" value={bkPass} onChange={(e) => setBkPass(e.target.value)} autoComplete="new-password" dir="ltr" hint={t("backup.passHint")} />
          <Field label={t("protect.confirm")} type="password" value={bkPass2} onChange={(e) => setBkPass2(e.target.value)} autoComplete="new-password" dir="ltr" />
          <div className="row wrap">
            <Button type="submit" busy={bkBusy}>{t("backup.save")}</Button>
            <Button type="button" variant="secondary" onClick={() => restoreInput.current?.click()} disabled={bkBusy}>{t("backup.restore")}</Button>
          </div>
        </form>
        <input ref={restoreInput} type="file" accept=".txt,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void restore(f); }} />
        {bkMsg && <p className="notice" role="status">{bkMsg}</p>}
      </Card>

      <Card>
        <h2>{t("settings.security")}</h2>
        <LockBadge label={t("chat.encrypted")} />
        <div className="row wrap">
          <Button variant="secondary" onClick={() => void exportData()}>{t("settings.exportData")}</Button>
          <Button variant="secondary" onClick={() => void confirmSignOut()}>{t("auth.signOut")}</Button>
          {me?.kind === "adult" && <Button variant="danger" onClick={() => void deleteAccount()}>{t("settings.deleteAccount")}</Button>}
        </div>
      </Card>

      <Card>
        <h2>{t("settings.about")}</h2>
        <p><strong>{t("app.name")}</strong> {VERSION}</p>
        <p className="tagline">{t("app.tagline")}</p>
        <p className="muted">{t("app.signature")}</p>
      </Card>
    </div>
  );
}

export function CallsScreen() {
  const { t } = usePrefs();
  return (
    <div className="page">
      <header className="pane-header"><h1>{t("calls.title")}</h1></header>
      <Card><p className="muted">{t("calls.comingSoon")}</p></Card>
    </div>
  );
}
