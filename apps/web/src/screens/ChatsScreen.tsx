import { LockIcon } from "../ui/icons";
import { formatTime, type Locale } from "@imello/localization";
import {
  acceptInvite,
  conversations,
  isRoomEncrypted,
  NotEncryptedError,
  readByOthers,
  typingMembers,
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
import { PING_COOLDOWN_MS, isPingBody, markPingSent, pingBody, pingCooldownLeft, pingSoundId } from "../lib/ping";
import { playPing, playSent, playTick, pingSound, PING_SOUNDS, previewPing, type PingSound } from "../lib/sounds";
import { Avatar, Button, EmptyState, LockBadge, Ltr, avatarColor } from "../ui/components";
import { prettyName } from "../lib/names";
import { EmojiPicker } from "../ui/emoji";
import { ProfileBar } from "../ui/profile-bar";
import type { MessageKey } from "@imello/localization";

// Drafts are kept in memory only: they may contain sensitive text.
const drafts = new Map<string, string>();

function displayNameOf(client: MatrixClient, userId: string | null, fallback: string): string {
  if (!userId) return prettyName(fallback);
  return prettyName(client.getUser(userId)?.displayName ?? fallback);
}

function chatDay(date: Date, locale: Locale, t: (key: MessageKey) => string): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(date)) / 86_400_000);
  if (diff === 0) return t("chat.today");
  if (diff === 1) return t("chat.yesterday");
  if (diff > 1 && diff < 7) return new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en", { weekday: "long" }).format(date);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en", { dateStyle: "medium" }).format(date);
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
        <h1 className="sr">{t("nav.chats")}</h1>
        <ProfileBar
          name={me?.displayName || me?.pin || "?"}
          userId={me?.userId ?? "me"}
          trailing={
            <a className="bar-action" href="#/contacts" aria-label={t("chats.new")} title={t("chats.new")}>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
            </a>
          }
        />
        {me?.credential === "device" && (
          <a className="protect-banner" href="#/settings"><LockIcon />{t("protect.banner")}</a>
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
  const typing = c.membership === "join" ? typingMembers(client, c.roomId) : [];
  const last = c.lastMessage;
  const preview = c.membership === "invite"
    ? t("chat.invitedYou", { name: displayNameOf(client, c.otherUserId, c.name) })
    : typing.length
      ? t("chat.typing")
      : last && isPingBody(last.body)
        ? t("chat.pingTitle")
        : last?.state === "failed"
          ? t("chat.notSent")
      : last?.decryptionFailed
        ? "🔒"
        : last?.attachment
          ? last.attachment.voice
            ? `🎤 ${t("chat.voiceMessage")}`
            : last.attachment.kind === "image"
              ? `📷 ${t("chat.photo")}`
              : `📄 ${last.attachment.name}`
          : last?.body ?? "";
  const unread = c.unread > 0;
  // Delivery marks on your own last message (D = on the server, R = read); a dot for theirs (gold = unread).
  const mark = !last || typing.length || c.membership === "invite" || !last.isOwn || last.state === "failed" || isPingBody(last.body)
    ? null
    : last.state === "sending" ? "sent" : readByOthers(client, c.roomId, last.id) ? "R" : "D";
  return (
    <li>
      <a className={`conv-row ${active ? "active" : ""} ${c.membership === "invite" ? "invite" : ""} ${unread ? "unread" : ""}`} href={`#/chats/${encodeURIComponent(c.roomId)}`} aria-current={active ? "page" : undefined}>
        <Avatar name={prettyName(c.name)} id={c.otherUserId ?? c.roomId} size={56} />
        <span className="conv-main">
          <span className="conv-top">
            <strong className="conv-name" dir="auto">{prettyName(c.name)}</strong>
            {c.lastActivity > 0 && <time className="conv-time">{formatTime(new Date(c.lastActivity), locale)}</time>}
          </span>
          <span className={`conv-preview ${typing.length ? "is-typing" : ""} ${last?.state === "failed" ? "is-failed" : ""} ${last && isPingBody(last.body) ? "is-ping" : ""}`}>
            {mark === "sent" ? (
              <span className="ks sent" aria-label={t("chat.status.sent")}><CheckIcon /></span>
            ) : mark ? (
              <span className={`ks ${mark === "R" ? "r" : "d"}`} aria-label={t(mark === "R" ? "chat.status.read" : "chat.status.delivered")}>{mark}</span>
            ) : null}
            <span className="conv-preview-text" dir="auto">{preview}</span>
            {unread && <span className="unread-pill" aria-label={t("chat.unreadCount", { count: c.unread })}><Ltr>{c.unread}</Ltr></span>}
          </span>
        </span>
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
  const { me } = useSession();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const recorder = useVoiceRecorder();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const membership = room?.getMyMembership();
  const messages = useMemo(() => roomMessages(client, roomId), [client, roomId, version]);
  const typing = room?.currentState.getMembers().filter((m) => m.typing && m.userId !== client.getUserId()) ?? [];
  const [shake, setShake] = useState(false);
  const [pingLeft, setPingLeft] = useState(() => pingCooldownLeft(roomId));
  const seenLive = useRef<string | null>(null);
  const armed = useRef(false);
  useEffect(() => {
    const id = setInterval(() => setPingLeft(pingCooldownLeft(roomId)), 250);
    return () => clearInterval(id);
  }, [roomId]);
  useEffect(() => {
    const last = messages.at(-1);
    if (!last || last.isOwn) return;
    const key = last.txnId ?? last.id;
    if (!armed.current) {
      armed.current = true;
      seenLive.current = key;
      return;
    }
    if (seenLive.current === key) return;
    seenLive.current = key;
    if (isPingBody(last.body)) {
      setShake(true);
      playPing(pingSoundId(last.body));
      navigator.vibrate?.([90, 70, 140]);
      const timer = setTimeout(() => setShake(false), 420);
      return () => clearTimeout(timer);
    }
    playTick();
  }, [messages]);

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

  function insertEmoji(e: string) {
    const el = textRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + e + text.slice(end);
    onChange(next);
    requestAnimationFrame(() => el?.setSelectionRange(start + e.length, start + e.length));
  }

  function submit() {
    const body = text.trim();
    if (!body || !encrypted) return;
    setText("");
    drafts.delete(roomId);
    setReplyTo(null);
    void setTyping(client, roomId, false).catch(() => undefined);
    playSent();
    void send(body);
  }

  const [pingPicker, setPingPicker] = useState(false);
  const [pingChoice, setPingChoice] = useState<PingSound>(pingSound);
  function sendPing(sound: PingSound = pingChoice) {
    if (!encrypted || pingCooldownLeft(roomId) > 0) return;
    markPingSent(roomId);
    setPingLeft(PING_COOLDOWN_MS);
    setPingPicker(false);
    void sendText(client, roomId, pingBody(sound)).catch(() => setError(t("chat.status.failed")));
  }

  function openFile(camera: boolean) {
    const el = fileInput.current;
    if (!el) return;
    el.accept = camera ? "image/*" : "";
    if (camera) el.setAttribute("capture", "environment");
    else el.removeAttribute("capture");
    el.click();
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
        <button className="back" onClick={() => navigate({ name: "chats" })} aria-label={t("common.back")}>
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" className="flip-rtl"><path fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
        </button>
        <Avatar name={otherName} id={roomId} size={40} />
        <div className="conv-title">
          <strong dir="auto">{otherName}</strong>
          <span className="conv-sub">
            {encrypted ? <LockBadge label={t("chat.encrypted")} /> : encrypted === false ? <span className="warn">{t("chat.notEncrypted")}</span> : null}
          </span>
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
      <div className={`messages ${shake ? "is-shaking" : ""}`} role="log" aria-live="polite" aria-relevant="additions" ref={listRef} onScroll={onScroll} onWheel={() => (userScrolled.current = true)} onTouchMove={() => (userScrolled.current = true)} onKeyDown={() => (userScrolled.current = true)}>
        {visible.map((m, i) => {
          const day = chatDay(new Date(m.timestamp), locale, t);
          const prev = visible[i - 1];
          const showDay = !prev || chatDay(new Date(prev.timestamp), locale, t) !== day;
          const quoted = m.replyTo ? messages.find((x) => x.id === m.replyTo) : null;
          const name = m.isOwn ? (me?.displayName || t("chat.you")) : displayNameOf(client, m.sender, m.sender);
          const continued = !!prev && prev.sender === m.sender && !showDay && m.timestamp - prev.timestamp < 120_000 && !isPingBody(m.body) && !isPingBody(prev.body);
          return (
            <MessageRow
              key={m.txnId ?? m.id}
              client={client}
              m={m}
              name={name}
              avatarId={m.isOwn ? (me?.userId ?? m.sender) : m.sender}
              read={m.isOwn && m.state === "sent" && readByOthers(client, roomId, m.id)}
              day={showDay ? day : null}
              continued={continued}
              group={(room?.getJoinedMemberCount() ?? 0) > 2}
              quotedBody={quoted ? (quoted.body ?? "🔒") : null}
              onReply={setReplyTo}
              onRetry={(body, txnId) => void send(body, txnId)}
            />
          );
        })}
        {typing.length > 0 && (
          <div className="typing" aria-live="polite">
            <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
            {typing.map((m) => m.name).join(", ")} {t("chat.typing")}
          </div>
        )}
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
      <>
      <div className="composer-dock">
      {pingPicker && (
        <div className="ping-sheet" role="dialog" aria-label={t("sounds.pingTone")}>
          {PING_SOUNDS.map((id) => (
            <div className="ping-tone" key={id}>
              <button type="button" className={`btn btn-ghost ${pingChoice === id ? "on" : ""}`} onClick={() => setPingChoice(id)} aria-pressed={pingChoice === id}>{t(`sounds.tone.${id}`)}</button>
              <button type="button" className="btn btn-ghost" onClick={() => previewPing(id)} aria-label={`${t("sounds.preview")}: ${t(`sounds.tone.${id}`)}`}>{t("sounds.preview")}</button>
            </div>
          ))}
          <button type="button" className="btn btn-primary" onClick={() => sendPing(pingChoice)}>{t("chat.ping")}</button>
        </div>
      )}
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
        <button type="button" className="emoji-key" onClick={() => setEmojiOpen((o) => !o)} aria-expanded={emojiOpen} aria-controls="emoji-panel" disabled={!encrypted} aria-label={t("chat.emoji")}>
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" /><path d="M8 14s1.5 2 4 2 4-2 4-2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /><path d="M9 9h.01M15 9h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        </button>
        <textarea
          ref={textRef}
          rows={1}
          dir="auto"
          placeholder={t("chat.placeholder")}
          aria-label={t("chat.placeholder")}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setEmojiOpen(false)}
          disabled={!encrypted}
          maxLength={20000}
        />
        <button type="button" className="icon-btn" onClick={() => openFile(false)} disabled={!encrypted || !!uploading} aria-label={t("chat.attach")}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" d="m21 11-8.6 8.6a5 5 0 0 1-7-7L14 4a3.4 3.4 0 0 1 4.9 4.9l-8.6 8.5a1.7 1.7 0 0 1-2.4-2.4L15.8 7" /></svg>
        </button>
        <button type="button" className="icon-btn send" onClick={submit} disabled={!encrypted || !text.trim()} aria-label={t("chat.send")}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="send-icon"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>
        </button>
      </div>
      {emojiOpen && <EmojiPicker id="emoji-panel" label={t("chat.emoji")} onPick={insertEmoji} />}
      <div className="actionbar" role="toolbar" aria-label={t("chat.actions")}>
        <button type="button" className="ab ab-ping" onClick={() => { setPingChoice(pingSound()); setPingPicker((open) => !open); }} disabled={!encrypted || pingLeft > 0} aria-expanded={pingPicker} aria-label={pingLeft > 0 ? t("chat.pingWait") : t("chat.ping")}>
          {pingLeft > 0 && (
            <svg className="ping-ring" viewBox="0 0 36 36" aria-hidden="true" ref={(el) => el?.style.setProperty("--dash", String((pingLeft / PING_COOLDOWN_MS) * 94))}>
              <circle cx="18" cy="18" r="15" />
            </svg>
          )}
          <NudgeIcon />
          <span>{t("chat.ping")}</span>
        </button>
        <button type="button" className="ab" onClick={() => openFile(false)} disabled={!encrypted || !!uploading} aria-label={t("chat.attach")}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" d="m21 11-8.6 8.6a5 5 0 0 1-7-7L14 4a3.4 3.4 0 0 1 4.9 4.9l-8.6 8.5a1.7 1.7 0 0 1-2.4-2.4L15.8 7" /></svg>
          <span>{t("chat.attachShort")}</span>
        </button>
        <button type="button" className="ab" onClick={() => void toggleRecording()} disabled={!encrypted || !!uploading} aria-label={t("chat.record")}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" /></svg>
          <span>{t("chat.voiceShort")}</span>
        </button>
        <button type="button" className="ab" onClick={() => openFile(true)} disabled={!encrypted || !!uploading} aria-label={t("chat.camera")}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4 7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4Zm3 13a4 4 0 1 1 4-4 4 4 0 0 1-4 4Z" /></svg>
          <span>{t("chat.camera")}</span>
        </button>
      </div>
      </div>
      </>
      )}
    </div>
  );
}

const PAGE = 50;

/** One message. Memoised: a sync tick re-renders only the rows whose content or status changed. */
const MessageRow = memo(
  function MessageRow({ client, m, name, avatarId, read, day, continued, group, quotedBody, onReply, onRetry }: { client: MatrixClient; m: ChatMessage; name: string; avatarId: string; read: boolean; day: string | null; continued: boolean; group: boolean; quotedBody: string | null; onReply: (m: ChatMessage) => void; onRetry: (body: string, txnId?: string) => void }) {
    const { t, locale } = usePrefs();
    const ping = isPingBody(m.body);
    const failed = m.isOwn && m.state === "failed";
    const status = !m.isOwn || ping ? null : m.state === "failed" ? "failed" : m.state === "sending" ? "sending" : read ? "read" : "delivered";
    return (
      <div className="msg-wrap">
        {day && <div className="day-sep"><span>{day}</span></div>}
        <div
          className={`msg ${m.isOwn ? "own" : "theirs"} ${continued ? "cont" : ""} ${ping ? "is-ping" : ""} ${m.decryptionFailed ? "undecryptable" : ""}`}
          data-testid="message"
          ref={(el) => { if (el && !m.isOwn) el.style.setProperty("--who", avatarColor(avatarId)); }}
        >
          <div
            className="bubble"
            onDoubleClick={() => !m.decryptionFailed && !ping && onReply(m)}
            onClick={() => { if (failed && m.body) onRetry(m.body, m.txnId ?? undefined); }}
          >
            {group && !m.isOwn && !ping && (
              <div className="card-head"><strong className="who" dir="auto">{name}</strong></div>
            )}
            {quotedBody && !ping && <div className="quote" dir="auto">{quotedBody}</div>}
            {ping ? (
              <div className="ping-copy">
                <span className="ping-icon" aria-hidden="true"><NudgeIcon /></span>
                <span>
                  <strong className="ping-title">{t("chat.pingTitle")}</strong>
                  <span className="ping-sub">{t("chat.pingedYou", { name })}</span>
                </span>
              </div>
            ) : m.attachment ? (
              <AttachmentView client={client} info={m.attachment} />
            ) : (
              <span dir="auto" className="body">{m.decryptionFailed ? t("chat.unableToDecrypt") : m.body}</span>
            )}
            <div className="meta">
              <time><Ltr>{formatTime(new Date(m.timestamp), locale)}</Ltr></time>
              {status && (
                <span className={`ks ${status === "read" ? "r" : status === "delivered" ? "d" : status === "failed" ? "failed" : "sent"}`} aria-label={t(status === "read" ? "chat.status.read" : status === "delivered" ? "chat.status.delivered" : status === "failed" ? "chat.status.failed" : "chat.status.sent")}>
                  {status === "read" ? "R" : status === "delivered" ? "D" : status === "failed" ? "!" : <CheckIcon />}
                </span>
              )}
            </div>
            {failed && <div className="conv-preview is-failed">{t("chat.notSent")}</div>}
          </div>
          {!m.decryptionFailed && !ping && (
            <button className="reply-btn" onClick={() => onReply(m)} aria-label="Reply"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 8V4l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11Z" fill="currentColor" /></svg></button>
          )}
        </div>
      </div>
    );
  },
  (a, b) =>
    a.client === b.client &&
    a.day === b.day &&
    a.name === b.name &&
    a.avatarId === b.avatarId &&
    a.read === b.read &&
    a.continued === b.continued &&
    a.group === b.group &&
    a.quotedBody === b.quotedBody &&
    a.onReply === b.onReply &&
    a.onRetry === b.onRetry &&
    a.m.id === b.m.id &&
    a.m.state === b.m.state &&
    a.m.body === b.m.body &&
    a.m.decryptionFailed === b.m.decryptionFailed &&
    a.m.timestamp === b.m.timestamp &&
    a.m.attachment?.file.url === b.m.attachment?.file.url,
);

function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function NudgeIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" /><path d="M11 17.5h2M4.5 8.5 3 12l1.5 3.5M19.5 8.5 21 12l-1.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>;
}
