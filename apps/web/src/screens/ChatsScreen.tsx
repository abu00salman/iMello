import { formatDay, formatTime } from "@imello/localization";
import {
  acceptInvite,
  conversations,
  isRoomEncrypted,
  NotEncryptedError,
  AttachmentTooLargeError,
  roomMessages,
  sendAttachment,
  sendText,
  setTyping,
  type ChatMessage,
  type ConversationSummary,
  type MatrixClient,
} from "@imello/core/messaging";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePrefs } from "../lib/prefs";
import { navigate } from "../lib/router";
import { useCalls } from "../lib/calls";
import { useClientVersion, useSession } from "../lib/session";
import { AttachmentView, formatDuration, imageSize, useVoiceRecorder } from "../ui/attachments";
import { Avatar, Button, EmptyState, LockBadge } from "../ui/components";
import { prettyName } from "../lib/names";

// Drafts are kept in memory only: they may contain sensitive text.
const drafts = new Map<string, string>();

function displayNameOf(client: MatrixClient, userId: string | null, fallback: string): string {
  if (!userId) return prettyName(fallback);
  return prettyName(client.getUser(userId)?.displayName ?? fallback);
}

export function ChatsScreen({ roomId }: { roomId?: string }) {
  const { client, me } = useSession();
  const { t } = usePrefs();
  const version = useClientVersion(client);
  const [query, setQuery] = useState("");
  const list = useMemo(() => (client ? conversations(client) : []), [client, version]);
  const filtered = query
    ? list.filter((c) => prettyName(c.name).toLowerCase().includes(query.toLowerCase()) || (c.lastMessage?.body ?? "").toLowerCase().includes(query.toLowerCase()))
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
      : c.lastMessage?.attachment
        ? c.lastMessage.attachment.voice
          ? `🎤 ${t("chat.voiceMessage")}`
          : c.lastMessage.attachment.kind === "image"
            ? `📷 ${t("chat.photo")}`
            : `📄 ${c.lastMessage.attachment.name}`
        : c.lastMessage?.body ?? "";
  return (
    <li>
      <a className={`conv-row ${active ? "active" : ""} ${c.membership === "invite" ? "invite" : ""}`} href={`#/chats/${encodeURIComponent(c.roomId)}`} aria-current={active ? "page" : undefined}>
        <Avatar name={prettyName(c.name)} id={c.otherUserId ?? c.roomId} size={52} />
        <span className="conv-main">
          <span className="conv-top">
            <strong className="conv-name" dir="auto">{prettyName(c.name)}</strong>
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
  // All hooks must run before any early return below (invite / loading states).
  const calls = useCalls();
  const recorder = useVoiceRecorder();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const membership = room?.getMyMembership();
  const messages = useMemo(() => roomMessages(client, roomId), [client, roomId, version]);
  const typing = room?.currentState.getMembers().filter((m) => m.typing && m.userId !== client.getUserId()) ?? [];

  // Encryption state only changes with membership/state events, not every sync tick.
  useEffect(() => {
    void isRoomEncrypted(client, roomId).then(setEncrypted);
  }, [client, roomId, membership]);

  // Render only the newest messages; older ones are added when you scroll up (and fetched from the
  // server when the local timeline runs out). Keeps the DOM small in long conversations.
  const [limit, setLimit] = useState(PAGE);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const prependAnchor = useRef<number | null>(null);
  const loadingOlder = useRef(false);
  const userScrolled = useRef(false);
  const visible = messages.length > limit ? messages.slice(-limit) : messages;

  const loadEarlier = useCallback(async () => {
    const el = listRef.current;
    if (!el || loadingOlder.current) return;
    if (limit < messages.length) {
      prependAnchor.current = el.scrollHeight - el.scrollTop;
      setLimit((l) => l + PAGE);
      return;
    }
    if (!room || !room.oldState.paginationToken) return;
    loadingOlder.current = true;
    prependAnchor.current = el.scrollHeight - el.scrollTop;
    try {
      await client.scrollback(room, PAGE);
      setLimit((l) => l + PAGE);
    } catch {
      prependAnchor.current = null;
    } finally {
      loadingOlder.current = false;
    }
  }, [client, room, limit, messages.length]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    // Only when the person scrolls up through a list that actually overflows — never on mount or
    // programmatic scrolls (that chained page after page of history fetch + decryption on open).
    if (userScrolled.current && el.scrollHeight > el.clientHeight + 200 && el.scrollTop < 240) void loadEarlier();
  }, [loadEarlier]);

  // Keep the reader's place when older messages are inserted above.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && prependAnchor.current !== null) {
      el.scrollTop = el.scrollHeight - prependAnchor.current;
      prependAnchor.current = null;
    }
  }, [visible.length]);

  // Open at the newest message.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [roomId]);

  useEffect(() => {
    // Follow new messages only when you're already at the bottom (or just sent one yourself);
    // never yank you away from older messages you're reading.
    const el = listRef.current;
    if (el && (nearBottom.current || messages.at(-1)?.isOwn)) el.scrollTop = el.scrollHeight;
    const last = room?.getLiveTimeline().getEvents().at(-1);
    if (last && membership === "join" && document.visibilityState === "visible") void client.sendReadReceipt(last).catch(() => undefined);
  }, [messages.length, client, room, membership]);

  useEffect(() => () => void setTyping(client, roomId, false).catch(() => undefined), [client, roomId]);

  if (!room) return <EmptyState>{t("common.loading")}</EmptyState>;

  const otherName = prettyName(room.name);
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


  async function sendFile(file: Blob, name: string, extra: { voice?: boolean; durationMs?: number } = {}) {
    setError(null);
    const mimetype = file.type || "application/octet-stream";
    setUploading({ name, progress: 0 });
    try {
      const size = mimetype.startsWith("image/") ? await imageSize(file) : null;
      await sendAttachment(client, roomId, file, {
        name,
        mimetype,
        ...extra,
        ...(size ?? {}),
        onProgress: (p) => setUploading({ name, progress: p }),
      });
    } catch (err) {
      setError(err instanceof AttachmentTooLargeError ? t("chat.tooLarge") : t("chat.status.failed"));
    } finally {
      setUploading(null);
    }
  }

  async function toggleRecording() {
    if (!recorder.recording) {
      try {
        await recorder.start();
      } catch {
        setError(t("chat.micDenied"));
      }
      return;
    }
    const rec = await recorder.stop();
    if (rec && rec.durationMs > 700) {
      const ext = rec.mimetype.includes("mp4") ? "m4a" : rec.mimetype.includes("ogg") ? "ogg" : "webm";
      await sendFile(rec.blob, `voice-message.${ext}`, { voice: true, durationMs: rec.durationMs });
    }
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

  return (
    <div className="conversation">
      <header className="conv-header">
        <button className="back" onClick={() => navigate({ name: "chats" })} aria-label={t("common.back")}>‹</button>
        <Avatar name={otherName} id={roomId} size={40} />
        <div className="conv-title">
          <strong dir="auto">{otherName}</strong>
          {encrypted ? <LockBadge label={t("chat.encrypted")} /> : encrypted === false ? <span className="warn">{t("chat.notEncrypted")}</span> : null}
        </div>
        {calls.supported && encrypted && (
          <div className="call-buttons">
            <button className="icon-btn call-start" onClick={() => void calls.call(roomId, true)} disabled={!!calls.active} aria-label={t("call.startVideo")}>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z" /></svg>
            </button>
            <button className="icon-btn call-start" onClick={() => void calls.call(roomId)} disabled={!!calls.active} aria-label={t("call.start")}>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11 11 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .6 3.6 1 1 0 0 1-.25 1Z" /></svg>
            </button>
          </div>
        )}
      </header>
      <div className="messages" role="log" aria-live="polite" aria-relevant="additions" ref={listRef} onScroll={onScroll} onWheel={() => (userScrolled.current = true)} onTouchMove={() => (userScrolled.current = true)} onKeyDown={() => (userScrolled.current = true)}>
        {visible.map((m, i) => {
          const day = formatDay(new Date(m.timestamp), locale);
          const prev = visible[i - 1];
          const showDay = !prev || formatDay(new Date(prev.timestamp), locale) !== day;
          const quoted = m.replyTo ? messages.find((x) => x.id === m.replyTo) : null;
          return (
            <MessageRow
              key={m.txnId ?? m.id}
              client={client}
              m={m}
              day={showDay ? day : null}
              quotedBody={quoted ? (quoted.body ?? "🔒") : null}
              onReply={setReplyTo}
            />
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
      {uploading && (
        <div className="upload-bar" role="status">
          <span dir="auto">⬆ {t("chat.uploading", { name: uploading.name })}</span>
          <span className="upload-track"><span ref={(el) => el?.style.setProperty("--p", `${Math.round(uploading.progress * 100)}%`)} /></span>
        </div>
      )}
      {recorder.recording ? (
        <div className="composer recording" role="status">
          <button className="icon-btn" onClick={recorder.cancel} aria-label={t("common.cancel")}>✕</button>
          <span className="rec-dot" aria-hidden="true" />
          <span className="rec-label">{t("chat.recording")} {formatDuration(recorder.elapsed)}</span>
          <Button onClick={() => void toggleRecording()} aria-label={t("chat.sendVoice")} className="send">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="send-icon"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>
          </Button>
        </div>
      ) : (
      <div className="composer">
        <input
          ref={fileInput}
          type="file"
          hidden
          data-testid="file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void sendFile(f, f.name);
          }}
        />
        <button className="icon-btn" onClick={() => fileInput.current?.click()} disabled={!encrypted || !!uploading} aria-label={t("chat.attach")}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.5 6.5v10a4.5 4.5 0 0 1-9 0V5a3 3 0 0 1 6 0v10.5a1.5 1.5 0 0 1-3 0V6.5H9v9a3 3 0 0 0 6 0V5a4.5 4.5 0 0 0-9 0v11.5a6 6 0 0 0 12 0v-10Z" /></svg>
        </button>
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
        {text.trim() ? (
          <Button onClick={submit} disabled={!encrypted} aria-label={t("chat.send")} className="send">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="send-icon"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>
          </Button>
        ) : (
          <Button onClick={() => void toggleRecording()} disabled={!encrypted || !!uploading} aria-label={t("chat.record")} className="send">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" /></svg>
          </Button>
        )}
      </div>
      )}
    </div>
  );
}

const PAGE = 50;

/** One message. Memoised: a sync tick re-renders only the rows whose content or status changed. */
const MessageRow = memo(
  function MessageRow({ client, m, day, quotedBody, onReply }: { client: MatrixClient; m: ChatMessage; day: string | null; quotedBody: string | null; onReply: (m: ChatMessage) => void }) {
    const { t, locale } = usePrefs();
    return (
      <div className="msg-wrap">
        {day && <div className="day-sep"><span>{day}</span></div>}
        <div className={`msg ${m.isOwn ? "own" : "theirs"} ${m.decryptionFailed ? "undecryptable" : ""}`} data-testid="message">
          <div className="bubble" onDoubleClick={() => !m.decryptionFailed && onReply(m)}>
            {quotedBody && <div className="quote" dir="auto">{quotedBody}</div>}
            {m.attachment ? (
              <AttachmentView client={client} info={m.attachment} />
            ) : (
              <span dir="auto" className="body">{m.decryptionFailed ? t("chat.unableToDecrypt") : m.body}</span>
            )}
            <span className="meta">
              <time>{formatTime(new Date(m.timestamp), locale)}</time>
              {m.isOwn && (
                <span className={`state ${m.state}`} aria-label={t(`chat.status.${m.state}`)}>
                  {m.state === "sending" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 8v4l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  ) : m.state === "failed" ? "!" : (
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12.5 4.5 4.5L19 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </span>
              )}
            </span>
          </div>
          {!m.decryptionFailed && (
            <button className="reply-btn" onClick={() => onReply(m)} aria-label={t("chat.reply")}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 8V4l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11Z" fill="currentColor" /></svg></button>
          )}
        </div>
      </div>
    );
  },
  (a, b) =>
    a.client === b.client &&
    a.day === b.day &&
    a.quotedBody === b.quotedBody &&
    a.onReply === b.onReply &&
    a.m.id === b.m.id &&
    a.m.state === b.m.state &&
    a.m.body === b.m.body &&
    a.m.decryptionFailed === b.m.decryptionFailed &&
    a.m.timestamp === b.m.timestamp &&
    a.m.attachment?.file.url === b.m.attachment?.file.url,
);
