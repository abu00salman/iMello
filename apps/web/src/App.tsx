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

  if (status === "loading") {
    return (
      <Splash />
    );
  }
  if (status === "signedOut") return <AuthScreen />;
  return <Shell route={route} />;
}

const NAV: { name: Route["name"]; label: MessageKey; icon: ReactNode }[] = [
  { name: "chats", label: "nav.chats", icon: <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /> },
  { name: "calls", label: "nav.calls", icon: <path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11 11 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .6 3.6 1 1 0 0 1-.25 1Z" /> },
  { name: "family", label: "nav.family", icon: <path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3Z" /> },
  { name: "contacts", label: "nav.contacts", icon: <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z" /> },
  { name: "settings", label: "nav.settings", icon: <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4ZM13 15.5A3.5 3.5 0 1 1 16.5 12 3.5 3.5 0 0 1 13 15.5Z" transform="translate(-1 0)" /> },
];

function Shell({ route }: { route: Route }) {
  const { t, locale } = usePrefs();
  const { me, temporary, client, api } = useSession();
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
    }
  }

  return (
    <div className={`shell ${isChild ? "kids" : ""}`}>
      <a href="#main" className="skip-link">{t("common.skipToContent")}</a>
      <nav className="tabbar" aria-label="iMello">
        <div className="tabbar-brand"><Logo size={32} /><span>{t("app.name")}</span></div>
        {nav.map((n) => {
          const active = route.name === n.name || (route.name === "invite" && n.name === "contacts");
          return (
            <a key={n.name} href={`#/${n.name}`} className={`tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">{n.icon}</svg>
              <span>{t(n.label)}</span>
            </a>
          );
        })}
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
                {t("chat.invitedYou", { name: c.name })}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Startup screen. If start-up takes unusually long (very slow network), offer a way out. */
function Splash() {
  const { t } = usePrefs();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 20_000);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="splash" role="status">
      <Logo size={88} />
      <p>{t("common.loading")}</p>
      {slow && (
        <>
          <p className="muted small center">{t("common.slowLoading")}</p>
          <button className="btn btn-secondary" onClick={() => location.reload()}>{t("common.retry")}</button>
        </>
      )}
    </div>
  );
}
