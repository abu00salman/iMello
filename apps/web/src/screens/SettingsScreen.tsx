import { listDevices, revokeDevice, type DeviceInfo } from "@imello/core/messaging";
import { formatDay } from "@imello/localization";
import { useCallback, useEffect, useState } from "react";
import { usePrefs, type ThemePref } from "../lib/prefs";
import { useSession } from "../lib/session";
import { Button, Card, LockBadge } from "../ui/components";

const VERSION = "1.0.0";

export function SettingsScreen() {
  const { t, locale, setLocale, theme, setTheme } = usePrefs();
  const { client, api, me, signOut, forget, temporary } = useSession();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (client) void listDevices(client).then(setDevices).catch(() => setError(t("common.error")));
  }, [client, t]);
  useEffect(load, [load]);

  async function revoke(d: DeviceInfo) {
    if (!client) return;
    const password = prompt(`${t("settings.signOutDevice")}: ${d.displayName ?? d.deviceId}\n${t("auth.password")}`);
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
    const password = prompt(t("settings.deleteAccountConfirm"));
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
        <p className="muted" dir="ltr">{me?.userId}</p>
        {temporary && <p className="notice">{t("auth.temporarySessionHint")}</p>}
      </Card>

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
        <h2>{t("settings.security")}</h2>
        <LockBadge label={t("chat.encrypted")} />
        <div className="row wrap">
          <Button variant="secondary" onClick={() => void exportData()}>{t("settings.exportData")}</Button>
          <Button variant="secondary" onClick={() => void signOut()}>{t("auth.signOut")}</Button>
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
