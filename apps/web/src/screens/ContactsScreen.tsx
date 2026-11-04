import { ApiError, extractInviteToken, normalizePin, type Contact, type ContactRequest, type Invite, type InvitePreview } from "@imello/core";
import { startDirectChat } from "@imello/core/messaging";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { usePrefs } from "../lib/prefs";
import { inviteUrl, navigate } from "../lib/router";
import { useSession } from "../lib/session";
import { Avatar, Button, Card, EmptyState, Ltr } from "../ui/components";

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
  const [pinInput, setPinInput] = useState("");
  const [incoming, setIncoming] = useState<ContactRequest[]>([]);

  const load = useCallback(
    () =>
      Promise.all([api.contacts(), api.contactRequests()])
        .then(([c, r]) => {
          setContacts(c);
          setIncoming(r.incoming);
        })
        .catch(() => setError(t("common.error"))),
    [api, t],
  );

  async function addByNumber() {
    setError(null);
    setMessage(null);
    const pin = normalizePin(pinInput);
    if (!pin) return setError(t("contacts.invalidNumber"));
    if (pin === me?.pin) return setError(t("contacts.invalidNumber"));
    try {
      const res = await api.sendContactRequest(pin);
      setPinInput("");
      setMessage(res.status === "already_contact" ? t("contacts.alreadyContact") : t("contacts.requestSent"));
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? t("auth.rateLimited") : err instanceof ApiError && err.status === 400 ? t("contacts.invalidNumber") : t("common.error"));
    }
  }

  async function respond(r: ContactRequest, accept: boolean) {
    const res = await api.respondToContactRequest(r.requestId, accept);
    if (accept) setMessage(res.contactStatus === "pending_guardian" ? t("contacts.pendingGuardian") : t("contacts.added"));
    await load();
  }
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
      const link = inviteUrl(inv.token);
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

  const link = invite ? inviteUrl(invite.token) : "";

  return (
    <div className="page">
      <header className="pane-header"><h1>{t("contacts.title")}</h1></header>
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <Card>
        <h2>{t("contacts.addByNumber")}</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void addByNumber();
          }}
        >
          <input
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="mell-123456"
            aria-label={t("contacts.addByNumber")}
            dir="ltr"
            inputMode="text"
            autoCapitalize="none"
            data-testid="pin-input"
          />
          <Button type="submit" disabled={!pinInput.trim()}>{t("contacts.add")}</Button>
        </form>
        {me?.pin && (
          <p className="muted small">
            {t("me.yourNumber")}: <strong className="code-inline"><Ltr>{me.pin}</Ltr></strong>
          </p>
        )}
      </Card>

      {incoming.length > 0 && (
        <Card>
          <h2>{t("contacts.requests")}</h2>
          <ul className="contact-list" role="list">
            {incoming.map((r) => (
              <li key={r.requestId} className="contact-row" data-testid="incoming-request">
                <Avatar name={r.displayName} id={r.userId} size={44} />
                <span className="contact-main">
                  <strong>{t("contacts.wantsToAdd", { name: r.displayName })}</strong>
                  {r.pin && <small className="muted"><Ltr>{r.pin}</Ltr></small>}
                </span>
                <Button onClick={() => void respond(r, true)}>{t("contacts.accept")}</Button>
                <Button variant="ghost" onClick={() => void respond(r, false)}>{t("contacts.decline")}</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
