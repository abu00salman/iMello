/**
 * Public layout fixture. The names are the same demo cast as the web preview
 * (Sara, Uncle Khalid, the Al Rashid family) plus a generic profile.
 * Nothing here is a signed-in account, a room id, or a private chat.
 */
export type FixtureScreen = "chats" | "chat" | "ping" | "signin";

export function fixtureScreen(raw: string | undefined): FixtureScreen {
  if (raw === "chat" || raw === "ping" || raw === "signin") return raw;
  return "chats";
}

export function fixtureLocale(raw: string | undefined): "en" | "ar" {
  return raw === "en" ? "en" : "ar";
}

/** `imello-preview.txt` is two words: `ar chats`. Written by the simulator job, not by a user. */
export function parsePreviewRequest(raw: string): { lang: "en" | "ar"; screen: FixtureScreen } {
  const [langRaw, screenRaw] = raw.trim().split(/\s+/);
  return { lang: fixtureLocale(langRaw), screen: fixtureScreen(screenRaw) };
}

export interface FixtureRow {
  id: string;
  name: { ar: string; en: string };
  kind: "text" | "ping" | "typing" | "failed" | "locked";
  preview: { ar: string; en: string };
  time: { ar: string; en: string };
  unread?: number;
  mark?: "D" | "R";
}

export const FIXTURE_PROFILE = { ar: "ليان", en: "Layan" } as const;

export const FIXTURE_ROWS: FixtureRow[] = [
  {
    id: "family",
    name: { ar: "عائلة الراشد", en: "Al Rashid" },
    kind: "text",
    preview: { ar: "أمي: العشاء الساعة 8", en: "Mum: dinner at 8" },
    time: { ar: "9:41 م", en: "9:41 AM" },
    unread: 3,
  },
  {
    id: "sara",
    name: { ar: "سارة", en: "Sara" },
    kind: "ping",
    preview: { ar: "نكزة!", en: "Ping!" },
    time: { ar: "9:41 م", en: "9:41 AM" },
    unread: 1,
  },
  {
    id: "mum",
    name: { ar: "أمي", en: "Mum" },
    kind: "text",
    preview: { ar: "نشوفك الليلة", en: "See you tonight" },
    time: { ar: "9:30 م", en: "9:30 AM" },
    mark: "R",
  },
  {
    id: "omar",
    name: { ar: "عمر", en: "Omar" },
    kind: "text",
    preview: { ar: "وصلتك الصورة؟", en: "Did the photo arrive?" },
    time: { ar: "9:12 م", en: "9:12 AM" },
    mark: "D",
  },
  {
    id: "khalid",
    name: { ar: "عمي خالد", en: "Uncle Khalid" },
    kind: "typing",
    preview: { ar: "يكتب الآن…", en: "typing…" },
    time: { ar: "8:50 م", en: "8:50 AM" },
  },
  {
    id: "layla",
    name: { ar: "ليلى", en: "Layla" },
    kind: "text",
    preview: { ar: "تمام، الجمعة إذن", en: "Friday works" },
    time: { ar: "أمس", en: "Yesterday" },
  },
  {
    id: "yousef",
    name: { ar: "يوسف", en: "Yousef" },
    kind: "failed",
    preview: { ar: "لم تُرسل", en: "Not sent" },
    time: { ar: "الثلاثاء", en: "Tuesday" },
  },
  {
    id: "noura",
    name: { ar: "نورة", en: "Noura" },
    kind: "locked",
    preview: { ar: "تعذّر قراءة هذه الرسالة على هذا الجهاز.", en: "This message can't be read on this device." },
    time: { ar: "الاثنين", en: "Monday" },
  },
];

export interface FixtureMessage {
  id: string;
  own: boolean;
  ping?: boolean;
  locked?: boolean;
  body?: { ar: string; en: string };
  time: { ar: string; en: string };
}

export const FIXTURE_THREAD: FixtureMessage[] = [
  { id: "ping", own: false, ping: true, time: { ar: "9:41 م", en: "9:41 AM" } },
  { id: "hello", own: true, body: { ar: "نشوفك الليلة", en: "See you tonight" }, time: { ar: "9:30 م", en: "9:30 AM" } },
  { id: "old", own: false, locked: true, time: { ar: "أمس", en: "Yesterday" } },
];
