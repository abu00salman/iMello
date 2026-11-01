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
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePrefs } from "../lib/prefs";
import { navigate } from "../lib/router";
import { useClientVersion, useSession } from "../lib/session";
import { AttachmentView, formatDuration, imageSize, useVoiceRecorder } from "../ui/attachments";
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
  // All hooks must run before any early return below (invite / loading states).
  const recorder = useVoiceRecorder();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
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
                  {m.attachment ? (
                    <AttachmentView client={client} info={m.attachment} />
                  ) : (
                    <span dir="auto" className="body">{m.decryptionFailed ? t("chat.unableToDecrypt") : m.body}</span>
                  )}
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
