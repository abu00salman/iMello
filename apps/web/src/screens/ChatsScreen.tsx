import { formatDay, formatTime } from "@imello/localization";
import {
  acceptInvite,
  conversations,
  isRoomEncrypted,
  NotEncryptedError,
  roomMessages,
  sendText,
  setTyping,
  type ChatMessage,
  type ConversationSummary,
  type MatrixClient,
} from "@imello/core/messaging";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePrefs } from "../lib/prefs";
import { navigate } from "../lib/router";
import { useClientVersion, useSession } from "../lib/session";
import { Avatar, Button, EmptyState, LockBadge } from "../ui/components";

// Drafts are kept in memory only: they may contain sensitive text.
const drafts = new Map<string, string>();

function displayNameOf(client: MatrixClient, userId: string | null, fallback: string): string {
  if (!userId) return fallback;
  return client.getUser(userId)?.displayName ?? fallback;
}

export function ChatsScreen({ roomId }: { roomId?: string }) {
  const { client, me } = useSession();
  const { t } = usePrefs();
  const version = useClientVersion(client);
  const [query, setQuery] = useState("");
  const list = useMemo(() => (client ? conversations(client) : []), [client, version]);
  const filtered = query
    ? list.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || (c.lastMessage?.body ?? "").toLowerCase().includes(query.toLowerCase()))
    : list;
  if (!client) return null;

  return (
    <div className={`split ${roomId ? "has-detail" : ""}`}>
      <aside className="list-pane" aria-label={t("nav.chats")}>
        <header className="pane-header">
          <h1>{t("nav.chats")}</h1>
        </header>
        {me?.credential === "device" && (
          <a className="protect-banner" href="#/settings">🔐 {t("protect.banner")}</a>
        )}
        <div className="search">
          <input type="search" placeholder={t("chats.search")} aria-label={t("chats.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon="💬">
            {t("chats.empty")}{" "}
            <a href="#/contacts">{t("contacts.invite")}</a>
          </EmptyState>
        ) : (
          <ul className="conv-list" role="list">
            {filtered.map((c) => (
              <ConversationRow key={c.roomId} client={client} c={c} active={c.roomId === roomId} />
            ))}
          </ul>
        )}
      </aside>
      <section className="detail-pane">
        {roomId ? <Conversation client={client} roomId={roomId} key={roomId} /> : <EmptyState icon="🔒">{t("chats.selectConversation")}</EmptyState>}
      </section>
    </div>
  );
}

function ConversationRow({ client, c, active }: { client: MatrixClient; c: ConversationSummary; active: boolean }) {
  const { t, locale } = usePrefs();
  const preview = c.membership === "invite"
    ? t("chat.invitedYou", { name: displayNameOf(client, c.otherUserId, c.name) })
    : c.lastMessage?.decryptionFailed
      ? "🔒"
      : c.lastMessage?.body ?? "";
  return (
    <li>
      <a className={`conv-row ${active ? "active" : ""} ${c.membership === "invite" ? "invite" : ""}`} href={`#/chats/${encodeURIComponent(c.roomId)}`} aria-current={active ? "page" : undefined}>
        <Avatar name={c.name} id={c.otherUserId ?? c.roomId} size={48} />
        <span className="conv-main">
          <span className="conv-top">
            <strong className="conv-name">{c.name}</strong>
            {c.lastActivity > 0 && <time className="conv-time">{formatTime(new Date(c.lastActivity), locale)}</time>}
          </span>
          <span className="conv-preview" dir="auto">{preview}</span>
        </span>
        {c.unread > 0 && <span className="badge" aria-label={`${c.unread}`}>{c.unread}</span>}
      </a>
    </li>
  );
}

function Conversation({ client, roomId }: { client: MatrixClient; roomId: string }) {
  const { t, locale } = usePrefs();
  const version = useClientVersion(client);
  const room = client.getRoom(roomId);
  const [encrypted, setEncrypted] = useState<boolean | null>(null);
  const [text, setText] = useState(() => drafts.get(roomId) ?? "");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<number>(0);
  const membership = room?.getMyMembership();
  const messages = useMemo(() => roomMessages(client, roomId), [client, roomId, version]);
  const typing = room?.currentState.getMembers().filter((m) => m.typing && m.userId !== client.getUserId()) ?? [];

  useEffect(() => {
    void isRoomEncrypted(client, roomId).then(setEncrypted);
  }, [client, roomId, version]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const last = room?.getLiveTimeline().getEvents().at(-1);
    if (last && membership === "join" && document.visibilityState === "visible") void client.sendReadReceipt(last).catch(() => undefined);
  }, [messages.length, client, room, membership]);

  useEffect(() => () => void setTyping(client, roomId, false).catch(() => undefined), [client, roomId]);

  if (!room) return <EmptyState>{t("common.loading")}</EmptyState>;

  const otherName = room.name;
  if (membership === "invite") {
    const inviter = room.getDMInviter() ?? room.getMember(client.getSafeUserId())?.events.member?.getSender() ?? "";
    return (
      <div className="invite-pane">
        <Avatar name={otherName} id={inviter} size={88} />
        <h2>{t("chat.invitedYou", { name: displayNameOf(client, inviter, otherName) })}</h2>
        <LockBadge label={t("chat.encrypted")} />
        <Button onClick={() => void acceptInvite(client, roomId)}>{t("chat.accept")}</Button>
      </div>
    );
  }

  async function send(body: string, txnId?: string) {
    setError(null);
    try {
      await sendText(client, roomId, body, { txnId, replyToEventId: replyTo?.id });
    } catch (err) {
      setError(err instanceof NotEncryptedError ? t("chat.notEncrypted") : t("chat.status.failed"));
    }
  }

  function submit() {
    const body = text.trim();
    if (!body || !encrypted) return;
    setText("");
    drafts.delete(roomId);
    setReplyTo(null);
    void setTyping(client, roomId, false).catch(() => undefined);
    void send(body);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function onChange(value: string) {
    setText(value);
    drafts.set(roomId, value);
    const now = Date.now();
    if (value && now - typingRef.current > 3000) {
      typingRef.current = now;
      void setTyping(client, roomId, true).catch(() => undefined);
    }
  }

  let lastDay = "";
  return (
    <div className="conversation">
      <header className="conv-header">
        <button className="back" onClick={() => navigate({ name: "chats" })} aria-label={t("common.back")}>‹</button>
        <Avatar name={otherName} id={roomId} size={36} />
        <div className="conv-title">
          <strong>{otherName}</strong>
          {encrypted ? <LockBadge label={t("chat.encrypted")} /> : encrypted === false ? <span className="warn">{t("chat.notEncrypted")}</span> : null}
        </div>
      </header>
      <div className="messages" role="log" aria-live="polite" aria-relevant="additions">
        {messages.map((m) => {
          const day = formatDay(new Date(m.timestamp), locale);
          const showDay = day !== lastDay;
          lastDay = day;
          const quoted = m.replyTo ? messages.find((x) => x.id === m.replyTo) : null;
          return (
            <div key={m.txnId ?? m.id}>
              {showDay && <div className="day-sep"><span>{day}</span></div>}
              <div className={`msg ${m.isOwn ? "own" : "theirs"} ${m.decryptionFailed ? "undecryptable" : ""}`} data-testid="message">
                <div className="bubble" onDoubleClick={() => !m.decryptionFailed && setReplyTo(m)}>
                  {quoted && <div className="quote" dir="auto">{quoted.body ?? "🔒"}</div>}
                  <span dir="auto" className="body">{m.decryptionFailed ? t("chat.unableToDecrypt") : m.body}</span>
                  <span className="meta">
                    <time>{formatTime(new Date(m.timestamp), locale)}</time>
                    {m.isOwn && (
                      <span className={`state ${m.state}`} aria-label={t(`chat.status.${m.state}`)}>
                        {m.state === "sending" ? "○" : m.state === "failed" ? "!" : "✓"}
                      </span>
                    )}
                  </span>
                </div>
                {!m.decryptionFailed && (
                  <button className="reply-btn" onClick={() => setReplyTo(m)} aria-label="Reply">↩</button>
                )}
              </div>
            </div>
          );
        })}
        {typing.length > 0 && <div className="typing" aria-live="polite">{typing.map((m) => m.name).join(", ")} …</div>}
        <div ref={endRef} />
      </div>
      {replyTo && (
        <div className="reply-bar">
          <span dir="auto">↩ {replyTo.body}</span>
          <button className="link" onClick={() => setReplyTo(null)} aria-label={t("common.cancel")}>✕</button>
        </div>
      )}
      {error && <p className="error composer-error" role="alert">{error}</p>}
      <div className="composer">
        <textarea
          rows={1}
          dir="auto"
          placeholder={t("chat.placeholder")}
          aria-label={t("chat.placeholder")}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          disabled={!encrypted}
          maxLength={20000}
        />
        <Button onClick={submit} disabled={!text.trim() || !encrypted} aria-label={t("chat.send")} className="send">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="send-icon"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>
        </Button>
      </div>
    </div>
  );
}
