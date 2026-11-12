import { acceptStatusInvites, expireMyStatuses, postStatus, statusUpdates } from "@imello/core/messaging";
import { formatTime } from "@imello/localization";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { prettyName } from "../lib/names";
import { usePrefs } from "../lib/prefs";
import { useClientVersion, useSession } from "../lib/session";
import { Avatar, Button, Card, EmptyState, Ltr } from "../ui/components";

/** 24-hour text updates shared with your contacts, end-to-end encrypted. */
export function UpdatesScreen() {
  const { t, locale } = usePrefs();
  const { client, me } = useSession();
  const version = useClientVersion(client);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    void acceptStatusInvites(client);
    void expireMyStatuses(client);
  }, [client]);

  // Hour-level refresh so 24-hour posts fall off while the screen is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const groups = useMemo(() => (client ? statusUpdates(client, now) : []), [client, version, now]);
  if (!client) return null;

  async function post(e: FormEvent) {
    e.preventDefault();
    if (!client || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await postStatus(client, text);
      setText("");
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }
  const nameOf = (id: string) => (id === client.getUserId() ? t("updates.you") : prettyName(client.getUser(id)?.displayName ?? id));

  return (
    <div className="page">
      <header className="pane-header"><h1>{t("nav.updates")}</h1></header>
      <Card>
        <form className="stack" onSubmit={(e) => void post(e)}>
          <label className="sr" htmlFor="status-text">{t("updates.placeholder")}</label>
          <textarea id="status-text" dir="auto" rows={2} maxLength={700} value={text} placeholder={t("updates.placeholder")} onChange={(e) => setText(e.target.value)} />
          <div className="row">
            <Button type="submit" busy={busy} disabled={!text.trim()}>{t("updates.post")}</Button>
            <small className="muted">{t("updates.privacy")}</small>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      </Card>
      {groups.length === 0 ? (
        <EmptyState>{t("updates.empty")}</EmptyState>
      ) : (
        <ul className="update-list" role="list" data-testid="update-list">
          {groups.map((g) => {
            const last = g.posts.at(-1)!;
            const expanded = open === g.userId;
            return (
              <li key={g.userId} className="update-group">
                <button type="button" className="update-head" onClick={() => setOpen(expanded ? null : g.userId)} aria-expanded={expanded}>
                  <span className="update-ring"><Avatar name={g.userId === client.getUserId() ? me?.displayName || "?" : nameOf(g.userId)} id={g.userId} size={48} /></span>
                  <span className="update-main">
                    <strong dir="auto">{nameOf(g.userId)}</strong>
                    <small className="muted" dir="auto">{expanded ? <Ltr>{formatTime(new Date(last.timestamp), locale)}</Ltr> : last.body}</small>
                  </span>
                  <bdi className="update-count">{g.posts.length}</bdi>
                </button>
                {expanded && (
                  <ol className="update-posts">
                    {g.posts.map((p) => (
                      <li key={p.id} className="update-post">
                        <p dir="auto">{p.body}</p>
                        <time className="muted small"><Ltr>{formatTime(new Date(p.timestamp), locale)}</Ltr></time>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {me?.kind === "child" ? null : <p className="muted small calls-note">{t("updates.note")}</p>}
    </div>
  );
}
