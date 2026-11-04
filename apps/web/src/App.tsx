import type { Contact } from "@imello/core";
import { conversations, startDirectChat } from "@imello/core/messaging";
import type { MessageKey } from "@imello/localization";
import { kids } from "@imello/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePrefs } from "./lib/prefs";
import { navigate, useRoute, type Route } from "./lib/router";
import { inApp, notificationsEnabled, watchMessages } from "./lib/notifications";
import { ensureBackgroundPush } from "./lib/push";
import { deviceName, useClientVersion, useSession } from "./lib/session";
import { AuthScreen } from "./screens/AuthScreen";
import { ChatsScreen } from "./screens/ChatsScreen";
import { ContactsScreen } from "./screens/ContactsScreen";
import { FamilyScreen } from "./screens/FamilyScreen";
import { PreviewScreen } from "./screens/PreviewScreen";
import { CallsScreen, SettingsScreen } from "./screens/SettingsScreen";
import { Avatar, Logo } from "./ui/components";

const PENDING_INVITE = "imello.pendingInvite";

export function App() {
  const { status } = useSession();
  const route = useRoute();

  // Keep an invite link across sign-in. The token is single-use and short-lived; sessionStorage clears with the tab.
  useEffect(() => {
    if (route.name === "invite") sessionStorage.setItem(PENDING_INVITE, route.token);
  }, [route]);

  if (route.name === "preview") return <PreviewScreen screen={route.screen} />;
  if (status === "loading" || status === "offline") return <Splash failed={status === "offline"} />;
  if (status === "signedOut") return <AuthScreen />;
  return <Shell route={route} />;
}

// Classic messenger tab bar: Chats · Contacts · Family · Settings (calls start from inside a chat).
const NAV: { name: Route["name"]; label: MessageKey; icon: ReactNode }[] = [
  { name: "chats", label: "nav.chats", icon: <path d="M3 4h18v12H9l-5 4v-4H3Zm4 4v2h10V8Zm0 4v2h7v-2Z" fillRule="evenodd" /> },
  { name: "contacts", label: "nav.contacts", icon: <path d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2c-4.4 0-8.5 2.2-8.5 5.5V21h17v-1.5C20.5 16.2 16.4 14 12 14Z" /> },
  { name: "family", label: "nav.family", icon: <path d="M8.5 11a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 8.5 11Zm7.5 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-7.5 2C5 13 1.5 14.7 1.5 17.3V19h14v-1.7C15.5 14.7 12 13 8.5 13Zm7.5.4a8 8 0 0 1 1.6 3.9V19h4.9v-1.4c0-2.2-2.9-3.9-6.5-4.2Z" /> },
];

function Shell({ route }: { route: Route }) {
  const { t, locale } = usePrefs();
  const { me, temporary, client, api } = useSession();
  const version = useClientVersion(client);
  const unreadChats = useMemo(() => (client ? conversations(client).filter((c) => c.unread > 0).length : 0), [client, version]);
  const isChild = me?.kind === "child";
  useEffect(() => {
    if (!client) return;
    return watchMessages(client, {
      newMessage: (name) => t("notify.newMessage", { name }),
      photo: `📷 ${t("chat.photo")}`,
      voice: `🎤 ${t("chat.voiceMessage")}`,
      file: "📄",
    });
  }, [client, t]);
  // Keep this device registered for background notifications (closed-app pushes).
  useEffect(() => {
    if (!client || inApp() || !notificationsEnabled()) return;
    void ensureBackgroundPush(client, api, { locale, deviceName: deviceName() });
  }, [client, api, locale]);
  const pending = sessionStorage.getItem(PENDING_INVITE);
  const nav = isChild ? NAV.filter((n) => n.name !== "contacts" && n.name !== "calls") : NAV;

  let content: ReactNode;
  if (route.name === "invite" || (pending && route.name === "contacts")) {
    sessionStorage.removeItem(PENDING_INVITE);
    content = <ContactsScreen initialToken={route.name === "invite" ? route.token : pending ?? undefined} />;
  } else if (isChild && route.name === "chats" && !route.roomId) {
    content = <KidsHome />;
  } else {
    switch (route.name) {
      case "chats": content = <ChatsScreen roomId={route.roomId} />; break;
      case "contacts": content = <ContactsScreen />; break;
      case "family": content = <FamilyScreen />; break;
      case "calls": content = <CallsScreen />; break;
      case "settings": content = <SettingsScreen />; break;
      default: content = null; break;
    }
  }

  return (
    <div className={`shell ${isChild ? "kids" : ""}`}>
      <a href="#main" className="skip-link">Skip to content</a>
      <nav className="tabbar" aria-label="iMello">
        <div className="tabbar-brand"><Logo size={32} /><span>{t("app.name")}</span></div>
        <a href="#/settings" className={`tab tab-end ${route.name === "settings" ? "active" : ""}`} aria-label={t("nav.settings")} aria-current={route.name === "settings" ? "page" : undefined}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </a>
        {nav.map((n) => {
          const active = route.name === n.name || (route.name === "invite" && n.name === "contacts");
          return (
            <a key={n.name} href={`#/${n.name}`} className={`tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">{n.icon}</svg>
              <span>{t(n.label)}</span>
              {n.name === "chats" && unreadChats > 0 && <span className="tab-badge"><bdi dir="ltr">{unreadChats}</bdi></span>}
            </a>
          );
        })}
        <a href="#/settings" className="tab tab-end" aria-label={t("nav.more")}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
        </a>
      </nav>
      <main id="main" className="content" tabIndex={-1}>
        {temporary && <div className="temp-banner" role="status">{t("auth.temporarySession")}</div>}
        {content}
      </main>
    </div>
  );
}

/** Kids Mode home: large, friendly cards for the people a child is allowed to talk to. */
function KidsHome() {
  const { t } = usePrefs();
  const { api, client, me } = useSession();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const version = useClientVersion(client);
  const invites = useMemo(() => (client ? conversations(client).filter((c) => c.membership === "invite") : []), [client, version]);
  useEffect(() => void api.contacts().then((c) => setContacts(c.filter((x) => x.status === "accepted"))), [api]);

  async function open(c: Contact) {
    if (!client) return;
    navigate({ name: "chats", roomId: await startDirectChat(client, c.userId) });
  }

  return (
    <div className="page kids-home">
      <h1 className="kids-hello">{t("kids.hello", { name: me?.displayName ?? "" })} 👋</h1>
      <p className="kids-sub">{t("kids.whoToTalk")}</p>
      <ul className="kids-grid" role="list">
        {contacts.map((c, i) => (
          <li key={c.userId}>
            <button
              className="kids-card"
              onClick={() => void open(c)}
              ref={(el) => el?.style.setProperty("--kids-accent", kids.accents[i % kids.accents.length]!)}
            >
              <Avatar name={c.displayName} id={c.userId} size={84} />
              <span>{c.displayName}</span>
            </button>
          </li>
        ))}
      </ul>
      {invites.length > 0 && (
        <ul className="kids-invites" role="list">
          {invites.map((c) => (
            <li key={c.roomId}>
              <a className="kids-invite" href={`#/chats/${encodeURIComponent(c.roomId)}`}>
                ✉️ {t("chat.invitedYou", { name: c.name })}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Startup screen. If start-up takes unusually long (very slow network), offer a way out. */
function Splash({ failed = false }: { failed?: boolean }) {
  const { t } = usePrefs();
  const { retry } = useSession();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 8_000);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="splash" role="status">
      <Logo size={88} />
      <p>{t("common.loading")}</p>
      {failed && <p className="muted small center">{t("session.unreachable")}</p>}
      {(failed || slow) && (
        <>
          {!failed && <p className="muted small center">{t("common.slowLoading")}</p>}
          <button className="btn btn-secondary" data-testid="boot-retry" onClick={() => retry()}>{t("common.retry")}</button>
        </>
      )}
    </div>
  );
}
