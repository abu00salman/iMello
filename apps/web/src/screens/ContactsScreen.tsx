import { ApiError, extractInviteToken, type Contact, type Invite, type InvitePreview } from "@imello/core";
import { startDirectChat } from "@imello/core/messaging";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { usePrefs } from "../lib/prefs";
import { navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { Avatar, Button, Card, EmptyState } from "../ui/components";

export function ContactsScreen({ initialToken }: { initialToken?: string }) {
  const { t } = usePrefs();
  const { api, client, me } = useSession();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invite, setInvite] = useState<(Invite & { link?: string }) | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState(initialToken ?? "");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => api.contacts().then(setContacts).catch(() => setError(t("common.error"))), [api, t]);
  useEffect(() => {
    void load();
    // Contact status can change elsewhere (e.g. a guardian approves): refresh on focus and periodically while visible.
    const onFocus = () => document.visibilityState === "visible" && void load();
    const timer = setInterval(onFocus, 15_000);
    addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  useEffect(() => {
    const token = extractInviteToken(code);
    setPreview(null);
    if (token) void api.previewInvite(token).then(setPreview).catch(() => setPreview(null));
  }, [code, api]);

  async function createInvite() {
    setError(null);
    try {
      const inv = (await api.createContactInvite()) as Invite & { link?: string };
      setInvite(inv);
      setCopied(false);
      const link = inv.link ?? `${location.origin}/#/i/${inv.token}`;
      setQr(await QRCode.toDataURL(link, { margin: 1, width: 220, errorCorrectionLevel: "M" }));
    } catch {
      setError(t("common.error"));
    }
  }

  async function redeem() {
    const token = extractInviteToken(code);
    if (!token) return setError(t("common.error"));
    setBusy(true);
    setError(null);
    try {
      const res = await api.redeemInvite(token);
      setCode("");
      if (location.hash.startsWith("#/i/")) navigate({ name: "contacts" });
      setMessage(res.contact?.status === "pending_guardian" ? t("contacts.pendingGuardian") : t("contacts.added"));
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "This invite has expired or was already used." : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function message_(c: Contact) {
    if (!client) return;
    try {
      const roomId = await startDirectChat(client, c.userId);
      navigate({ name: "chats", roomId });
    } catch {
      setError(t("common.error"));
    }
  }

  async function block(c: Contact) {
    if (!confirm(`${t("contacts.block")} ${c.displayName}?`)) return;
    await api.block(c.userId);
    const ignored = client?.getIgnoredUsers() ?? [];
    await client?.setIgnoredUsers([...new Set([...ignored, c.userId])]).catch(() => undefined);
    await load();
  }

  async function report(c: Contact) {
    const details = prompt(`${t("contacts.report")} ${c.displayName}`) ?? undefined;
    if (details === undefined) return;
    await api.report(c.userId, me?.kind === "child" ? "child_safety" : "other", details);
    setMessage("Thank you. The report was sent.");
  }

  const link = invite ? invite.link ?? `${location.origin}/#/i/${invite.token}` : "";

  return (
    <div className="page">
      <header className="pane-header"><h1>{t("contacts.title")}</h1></header>
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="grid-2">
        <Card>
          <h2>{t("contacts.invite")}</h2>
          <p className="muted">{t("contacts.inviteHint")}</p>
          {invite ? (
            <div className="invite-share">
              {qr && <img src={qr} alt="QR code" width={220} height={220} className="qr" />}
              <input readOnly value={link} dir="ltr" aria-label="Invite link" onFocus={(e) => e.target.select()} data-testid="invite-link" />
              <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}>
                {copied ? t("common.copied") : t("common.copy")}
              </Button>
            </div>
          ) : (
            <Button onClick={createInvite}>{t("contacts.invite")}</Button>
          )}
        </Card>
        <Card>
          <h2>{t("contacts.redeem")}</h2>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("contacts.redeemPlaceholder")}
            aria-label={t("contacts.redeemPlaceholder")}
            dir="ltr"
            data-testid="redeem-input"
          />
          {preview && <p className="muted">{preview.familyName ? `${preview.inviterDisplayName} · ${preview.familyName}` : preview.inviterDisplayName}</p>}
          <Button onClick={redeem} busy={busy} disabled={!extractInviteToken(code)}>{t("common.continue")}</Button>
        </Card>
      </div>

      <Card>
        {contacts.length === 0 ? (
          <EmptyState icon="👋">{t("contacts.empty")}</EmptyState>
        ) : (
          <ul className="contact-list" role="list">
            {contacts.map((c) => (
              <li key={c.userId} className="contact-row">
                <Avatar name={c.displayName} id={c.userId} size={44} />
                <span className="contact-main">
                  <strong>{c.displayName}</strong>
                  <small className="muted">{c.status === "pending_guardian" ? t("contacts.pendingGuardian") : c.kind === "child" ? "👧" : ""}</small>
                </span>
                {c.status === "accepted" && <Button onClick={() => void message_(c)}>{t("contacts.message")}</Button>}
                <Button variant="ghost" onClick={() => void block(c)}>{t("contacts.block")}</Button>
                <Button variant="ghost" onClick={() => void report(c)}>{t("contacts.report")}</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
