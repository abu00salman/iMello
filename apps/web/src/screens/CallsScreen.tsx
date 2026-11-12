import { callHistory, type CallRecord } from "@imello/core/messaging";
import { formatTime } from "@imello/localization";
import { useMemo } from "react";
import { useCalls } from "../lib/calls";
import { prettyName } from "../lib/names";
import { usePrefs } from "../lib/prefs";
import { useClientVersion, useSession } from "../lib/session";
import { Avatar, EmptyState, Ltr } from "../ui/components";

/** Real call history, read from the call events in your conversations. Tap to call back. */
export function CallsScreen() {
  const { t, locale } = usePrefs();
  const { client } = useSession();
  const version = useClientVersion(client);
  const calls = useCalls();
  const list = useMemo(() => (client ? callHistory(client) : []), [client, version]);
  if (!client) return null;
  const nameOf = (c: CallRecord) => prettyName(c.otherUserId ? client.getUser(c.otherUserId)?.displayName ?? c.otherUserId : client.getRoom(c.roomId)?.name ?? "");
  const when = (ts: number) => {
    const d = new Date(ts);
    const today = new Date().toDateString() === d.toDateString();
    return today ? formatTime(d, locale) : d.toLocaleDateString(locale === "ar" ? "ar-u-nu-latn" : "en", { day: "numeric", month: "short" });
  };
  const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="page">
      <header className="pane-header"><h1>{t("nav.calls")}</h1></header>
      {list.length === 0 ? (
        <EmptyState>{t("calls.empty")}</EmptyState>
      ) : (
        <ul className="call-list" role="list" data-testid="call-list">
          {list.map((c) => {
            const missed = !c.outgoing && !c.answered;
            const name = nameOf(c);
            return (
              <li key={c.callId} className={`call-row ${missed ? "missed" : ""}`}>
                <Avatar name={name} id={c.otherUserId ?? c.roomId} size={44} />
                <span className="call-main">
                  <strong dir="auto">{name}</strong>
                  <small className="call-sub">
                    <span aria-hidden="true">{c.outgoing ? "↗" : "↙"}</span>{" "}
                    {t(missed ? "calls.missed" : c.outgoing ? "calls.outgoing" : "calls.incoming")}
                    {" · "}{t(c.video ? "calls.video" : "calls.voice")}
                    {c.durationSec != null && <> · <Ltr>{dur(c.durationSec)}</Ltr></>}
                  </small>
                </span>
                <time className="call-time"><Ltr>{when(c.startedAt)}</Ltr></time>
                {calls.supported && (
                  <button type="button" className="icon-btn" onClick={() => void calls.call(c.roomId, c.video)} disabled={!!calls.active} aria-label={t(c.video ? "call.startVideo" : "call.start")}>
                    {c.video ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15 8v8H3V8Zm2 3.2 4-2.7v7l-4-2.7Z" /></svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .57 3.6 1 1 0 0 1-.25 1Z" /></svg>
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small calls-note">{t("calls.historyNote")}</p>
    </div>
  );
}
