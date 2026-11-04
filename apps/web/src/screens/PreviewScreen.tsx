import { usePrefs } from "../lib/prefs";
import { AppearancePanel } from "./Appearance";
import { Avatar, Ltr } from "../ui/components";

/** Offline fixture for the classic layout. Not linked from the product UI. */
export function PreviewScreen({ screen }: { screen: "list" | "chat" | "appearance" | "contacts" }) {
  const { t, locale } = usePrefs();
  const ar = locale === "ar";
  const rows = ar
    ? [
        { name: "عائلة الراشد", preview: "أمي: العشاء الساعة 8، جيبوا الأولاد", time: "9:41 م", unread: 3, who: "family" },
        { name: "سارة", preview: "نكزة!", time: "9:41 م", unread: 1, ping: true },
        { name: "أمي", preview: "نشوفك الليلة", time: "9:30 م", mark: "R" },
        { name: "عمر", preview: "وصلتك الصورة؟", time: "9:12 م", mark: "D" },
        { name: "عمي خالد", preview: "يكتب الآن…", time: "8:50 م", typing: true },
        { name: "ليلى", preview: "تمام، الجمعة إذن", time: "أمس", read: true },
        { name: "يوسف", preview: "لم تُرسل · اضغط لإعادة المحاولة", time: "الثلاثاء", failed: true },
        { name: "نورة", preview: "شكرًا جزيلًا", time: "الاثنين" },
      ]
    : [
        { name: "Al Rashid", preview: "Mum: dinner at 8, bring the kids", time: "9:41 AM", unread: 3, who: "family" },
        { name: "Sara", preview: "Ping!", time: "9:41 AM", unread: 1, ping: true },
        { name: "Mum", preview: "See you tonight", time: "9:30 AM", mark: "R" },
        { name: "Omar", preview: "Did the photo arrive?", time: "9:12 AM", mark: "D" },
        { name: "Uncle Khalid", preview: "typing…", time: "8:50 AM", typing: true },
        { name: "Layla", preview: "Friday works", time: "Yesterday" },
        { name: "Yousef", preview: "Not sent · Tap to retry", time: "Tuesday", failed: true },
        { name: "Noura", preview: "Thank you so much", time: "Monday" },
      ];

  return (
    <div className={`shell ${screen === "list" ? "preview-wide" : ""}`}>
      <nav className="tabbar" aria-label="iMello">
        <a href="#/preview/appearance" className={`tab tab-end ${screen === "appearance" ? "active" : ""}`} aria-label={t("nav.settings")}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </a>
        <a href="#/preview" className={`tab ${screen === "list" || screen === "chat" ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M4 5h16v10H8l-4 3Z" /></svg>
          <span>{t("nav.chats")}</span>
          <span className="tab-badge"><Ltr>4</Ltr></span>
        </a>
        <a href="#/preview/contacts" className={`tab ${screen === "contacts" ? "active" : ""}`}><span>{t("nav.contacts")}</span></a>
        <a href="#/preview" className="tab"><span>{t("nav.family")}</span></a>
        <a href="#/preview/appearance" className="tab tab-end" aria-label={t("nav.more")}>⋮</a>
      </nav>
      <main className="content">
        {screen === "appearance" ? (
          <div className="page">
            <header className="pane-header"><h1>{t("settings.theme")}</h1></header>
            <AppearancePanel heading={false} />
          </div>
        ) : screen === "contacts" ? (
          <div className="list-pane">
            <header className="profile-bar">
              <Avatar name={ar ? "أبو سلمان" : "Abu Salman"} id="me" size={46} />
              <div className="bar-titles">
                <strong className="bar-title">{ar ? "أبو سلمان" : "Abu Salman"}</strong>
                <span className="bar-status"><span className="av-dot" />{t("profile.available")}<span>·</span><span className="pm">{ar ? "في الدوام حتى 5" : "At work until 5"}</span></span>
              </div>
            </header>
            <div className="search"><input readOnly value="" placeholder={t("contacts.search")} aria-label={t("contacts.search")} /></div>
            <a className="invite-row" href="#/preview/contacts">
              <strong>{t("contacts.inviteFriends")}</strong>
            </a>
            <div className="k-letter">أ</div>
            <ul className="conv-list">
              <li><div className="conv-row"><Avatar name={ar ? "أمي" : "Mum"} id="mum" size={52} /><span className="conv-main"><strong className="conv-name">{ar ? "أمي" : "Mum"}</strong><span className="conv-preview"><span className="av-dot" />{t("profile.available")}</span></span></div></li>
            </ul>
          </div>
        ) : (
          <div className={`split ${screen === "chat" ? "has-detail" : ""}`}>
            <aside className="list-pane">
              <header className="profile-bar">
                <Avatar name={ar ? "أبو سلمان" : "Abu Salman"} id="me" size={46} />
                <div className="bar-titles">
                  <strong className="bar-title">{ar ? "أبو سلمان" : "Abu Salman"}</strong>
                  <span className="bar-status"><span className="av-dot" />{t("profile.available")}<span>·</span><span className="pm">{ar ? "في الدوام حتى 5" : "At work until 5"}</span></span>
                </div>
              </header>
              <ul className="conv-list">
                {rows.map((r) => (
                  <li key={r.name}>
                    <a className={`conv-row ${r.unread ? "unread" : ""}`} href="#/preview/chat">
                      <Avatar name={r.name} id={r.who ?? r.name} size={52} />
                      <span className="conv-main">
                        <span className="conv-top"><strong className="conv-name" dir="auto">{r.name}</strong><time className="conv-time"><Ltr>{r.time}</Ltr></time></span>
                        <span className={`conv-preview ${r.typing ? "is-typing" : ""} ${r.failed ? "is-failed" : ""} ${r.ping ? "is-ping" : ""}`}>
                          {r.mark && <span className={`ks ${r.mark === "R" ? "r" : "d"}`}>{r.mark}</span>}
                          <span className="conv-preview-text" dir="auto">{r.preview}</span>
                          {r.unread ? <span className="unread-pill"><Ltr>{r.unread}</Ltr></span> : null}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </aside>
            <section className="detail-pane">
              {screen === "chat" ? <PreviewChat ar={ar} /> : <p className="empty">{t("chats.selectConversation")}</p>}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function PreviewChat({ ar }: { ar: boolean }) {
  const { t } = usePrefs();
  const bubble = (own: boolean, text: string, time: string, mark?: "R" | "D" | "sent", ping = false) => (
    <div className={`msg ${own ? "own" : "theirs"} ${ping ? "is-ping" : ""}`}>
      <div className="bubble">
        {ping ? (
          <div className="ping-copy">
            <span className="ping-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" /><path d="M11 17.5h2M4.5 8.5 3 12l1.5 3.5M19.5 8.5 21 12l-1.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg></span>
            <span><strong className="ping-title">{t("chat.pingTitle")}</strong><span className="ping-sub">{t("chat.pingedYou", { name: ar ? "سارة" : "Sara" })}</span></span>
          </div>
        ) : <span className="body" dir="auto">{text}</span>}
        <div className="meta"><time><Ltr>{time}</Ltr></time>{mark === "sent" ? <span className="ks sent">✓</span> : mark ? <span className={`ks ${mark === "R" ? "r" : "d"}`}>{mark}</span> : null}</div>
      </div>
    </div>
  );
  return (
    <div className="conversation">
      <header className="conv-header">
        <span className="back" aria-hidden="true">‹</span>
        <Avatar name={ar ? "سارة" : "Sara"} id="sara" size={40} />
        <div className="conv-title">
          <strong>{ar ? "سارة" : "Sara"}</strong>
          <span className="conv-sub"><span className="av-dot" />{t("profile.available")}</span>
        </div>
      </header>
      <div className="messages">
        <div className="day-sep"><span>{t("chat.today")}</span></div>
        {bubble(false, ar ? "بتجي الليلة؟" : "Are you coming tonight?", "9:18")}
        {bubble(true, ar ? "أكيد! بطلع بعد 10 دقايق" : "Yes! Leaving in 10 minutes", "9:20", "R")}
        {bubble(false, ar ? "جيب الشاحن معك لو سمحت" : "Bring the charger please", "9:22")}
        {bubble(false, "", "9:23", undefined, true)}
        {bubble(true, ar ? "في الطريق" : "On the way", "9:24", "R")}
        {bubble(true, ar ? "أنا برّا، افتحي الباب" : "I'm outside, open the door", "9:31", "D")}
        {bubble(true, ar ? "دقيقتين" : "Two minutes", "9:31", "sent")}
      </div>
      <div className="composer-dock">
          <div className="composer">
          <span className="emoji-key" aria-hidden="true">☺</span>
          <textarea readOnly rows={1} placeholder={t("chat.placeholder")} aria-label={t("chat.placeholder")} />
        </div>
        <div className="actionbar">
          <span className="ab ab-ping">{t("chat.ping")}</span>
          <span className="ab">{t("chat.attachShort")}</span>
          <span className="ab">{t("chat.voiceShort")}</span>
          <span className="ab">{t("chat.camera")}</span>
        </div>
      </div>
    </div>
  );
}
