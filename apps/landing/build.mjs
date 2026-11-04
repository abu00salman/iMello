// Generates index.html (Arabic + English in one document). Run: node build.mjs
// v0.3.1 "Classic structure" look: Classic Blue by default (Automatic light/dark), Coral as an alternative theme.
import { writeFileSync } from "node:fs";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* "mell-" tokens are LTR islands: without isolation the trailing hyphen is a neutral and flips to "-mell" in Arabic (QA RS-021 B1). */
const mell = (s) => s.replace(/mell-(\d*)/g, '<bdi dir="ltr">mell-$1</bdi>');
const L = (ar, en) => `<span data-l="ar">${mell(esc(ar))}</span><span data-l="en">${mell(esc(en))}</span>`;

/* Our own line icons (24 grid, 1.75 stroke). Presentation attributes only, so the CSP needs no inline styles. */
const P = {
  lock: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
  hash: `<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>`,
  noads: `<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>`,
  kids: `<path d="M12 3 19 6v5c0 4.6-2.9 8.2-7 9.8C7.9 19.2 5 15.6 5 11V6z"/><path d="m9 12 2 2 4-4"/>`,
  chat: `<path d="M4 5h16v11H10l-6 4z"/>`,
  call: `<path d="M7 3.5h2.6l1.6 4.4-2 1.5a11.5 11.5 0 0 0 5.4 5.4l1.5-2 4.4 1.6V17a2.5 2.5 0 0 1-2.6 2.5A15.5 15.5 0 0 1 4.5 6 2.5 2.5 0 0 1 7 3.5z"/>`,
  phone: `<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>`,
  eye: `<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/><path d="m4 4 16 16"/>`,
  get: `<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14"/>`,
  server: `<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M8 7.5h.01M8 16.5h.01"/>`,
  check: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  arrow: `<path d="M7 17 17 7M9 7h8v8"/>`,
  send: `<path d="M4 12 20 4l-4 16-4.5-6.5z"/><path d="M11.5 13.5 20 4"/>`,
};
const icon = (k, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]}</svg>`;

const sheets = [
  { cls: "s1", ic: "chat", video: true, ar: ["رسائل مشفّرة", "نص وصور وملفات وتسجيلات صوتية، تُشفَّر على جهازك قبل ما تطلع. السيرفر يحفظ نصًا مشفّرًا فقط."], en: ["Encrypted chats", "Text, photos, files and voice notes are encrypted on your device before they leave. The server only ever stores ciphertext."], alt: ["محادثة حقيقية في آي ميلو", "A real chat in iMello"] },
  { cls: "s2", ic: "call", img: "call.jpg", w: 640, h: 1066, ar: ["مكالمات صوت وفيديو", "اتصل بأهلك صوت أو فيديو من نفس المحادثة. الصوت والصورة يمرّون بين الجهازين مباشرة."], en: ["Voice and video calls", "Call family by voice or video from the same chat. Audio and picture go straight between the two devices."], alt: ["شاشة مكالمة واردة", "An incoming call"] },
  { cls: "s3", ic: "hash", img: "settings.jpg", w: 640, h: 1066, ar: ["رقمك بدل رقم الجوال", "تاخذ رقمًا مثل mell-482913 تشاركه مع أهلك وأصحابك. ما نطلب رقم جوال ولا إيميل."], en: ["A number, not your phone number", "You get a number like mell-482913 to share with family and friends. We never ask for a phone number or an email."], alt: ["رقمك في الإعدادات", "Your number in Settings"] },
  { cls: "s4", ic: "noads", img: "list.jpg", w: 640, h: 1066, ar: ["بدون إعلانات ولا تتبّع", "ما فيه إعلانات، ولا خلاصة عشوائية، ولا تتبّع. النسخة الاحتياطية لمفاتيحك ملف على جوالك أنت، ولا تنرفع لأي مكان."], en: ["No ads, no tracking", "No ads, no feed, no tracking. Your key backup is a file on your own phone and is never uploaded anywhere."], alt: ["قائمة المحادثات", "The chat list"] },
  { cls: "s5", ic: "kids", img: null, ar: ["وضع الأطفال", "ولي الأمر يضيف حساب الطفل ويوافق على من يتواصل معهم. الطفل ما يستقبل طلبات من الغرباء. هذا مفروض من السيرفر، مو من الواجهة بس."], en: ["Kids Mode", "A guardian creates the child's account and approves who they can talk to. Strangers can't reach a child. The server enforces it, not just the interface."], big: ["مع من توافق عليه فقط", "Only people you approve"] },
];
const media = (s) => s.video
  ? `<video class="sheet-img" width="390" height="844" muted loop playsinline preload="none" poster="img/chat-poster.jpg" aria-label="${esc(s.alt[0])}" data-ar="${esc(s.alt[0])}" data-en="${esc(s.alt[1])}" data-attr="aria-label"><source src="img/chat.webm" type="video/webm"><source src="img/chat.mp4" type="video/mp4"></video>`
  : s.img ? `<img class="sheet-img" src="img/${s.img}" width="${s.w}" height="${s.h}" alt="${esc(s.alt[0])}" data-ar="${esc(s.alt[0])}" data-en="${esc(s.alt[1])}" data-attr="alt" loading="lazy" decoding="async">`
  : `<p class="sheet-big">${icon("check", "ic big-ic")}<span>${L(s.big[0], s.big[1])}</span></p>`;
const sheetHtml = sheets.map((s) => `
    <article class="sheet ${s.cls}" data-rise>
      <h3 class="sheet-name">${icon(s.ic)}<span>${L(s.ar[0], s.en[0])}</span></h3>
      <div class="sheet-body">
        <p class="sheet-text">${L(s.ar[1], s.en[1])}</p>
        <div class="sheet-media">${media(s)}</div>
      </div>
    </article>`).join("");

const slip = [
  ["أول مرة", "The first time", [["تضغط «ابدأ الآن»", "Tap “Start now”", "بدون تسجيل", "no sign-up"], ["تاخذ رقمك mell-", "You get your mell- number", "فورًا", "instantly"]]],
  ["تضيف أهلك", "Add your people", [["تشارك رقمك أو تكتب رقمهم", "Share your number or type theirs", "ضغطة", "one tap"], ["هم يقبلون الطلب", "They accept the request", "منهم", "on their side"]]],
  ["بعدها", "Then", [["تراسلهم نص وصور وصوت ومكالمات", "Message, send photos and voice, call", "مشفّرة", "encrypted"], ["تحمي حسابك بكلمة سر", "Protect your account with a password", "اختياري", "optional"], ["تحفظ نسخة مفاتيحك على جوالك", "Save a key backup on your phone", "اختياري", "optional"]]],
];
const slipHtml = slip.map(([ha, he, rows]) => `
          <h3 class="slip-h"><span>${L(ha, he)}</span></h3>
          ${rows.map(([a, e, va, ve]) => `<p class="slip-row"><span class="slip-what">${L(a, e)}</span><span class="slip-val">${L(va, ve)}</span></p>`).join("")}`).join("");

const faq = [
  ["lock", "الأمان", "Security", "هل رسائلي مشفّرة فعلًا؟", "Are my messages really encrypted?",
    "نعم: الرسائل والصور والملفات والتسجيلات تُشفَّر من طرف إلى طرف، والسيرفر ما يشوف إلا نصًا مشفّرًا. لكن آي ميلو لسا نسخة تجريبية، وما راجعه طرف أمني مستقل بعد. لا تعتمد عليه في اتصالات عالية الخطورة.",
    "Yes: messages, photos, files and voice notes are end-to-end encrypted, and the server only sees ciphertext. But iMello is still a preview and hasn't had an independent security review. Don't rely on it for high-risk communication."],
  ["phone", "الجوال", "Phone", "وش يصير لو ضاع جوالي؟", "What if I lose my phone?",
    "لو ما حطيت كلمة سر لحسابك، الحساب مربوط بالجهاز وينفقد معه. احمِ حسابك بكلمة سر من الإعدادات، واحفظ نسخة المفاتيح على جوالك: الرسائل القديمة ما ترجع بدونها.",
    "If you haven't set a password, the account is tied to the device and is lost with it. Protect your account from Settings and keep a key backup on your phone: old messages can't come back without it."],
  ["kids", "الأطفال", "Kids", "كيف يشتغل وضع الأطفال؟", "How does Kids Mode work?",
    "ولي الأمر ينشئ حساب الطفل ويوافق على جهات الاتصال. أي طلب لطفل يروح لولي الأمر أول، والسيرفر يرفض أي تواصل ما وافق عليه.",
    "A guardian creates the child's account and approves contacts. Any request to a child goes to the guardian first, and the server rejects contact that wasn't approved."],
  ["eye", "الخصوصية", "Privacy", "هل فيه إعلانات أو تتبّع؟", "Are there ads or tracking?",
    "لا. ما فيه إعلانات ولا تحليلات تتبّع. الإشعارات ما تعرض نص الرسالة، وتقدر تطفيها.",
    "No. There are no ads and no tracking analytics. Notifications never show message text, and you can turn them off."],
  ["get", "التحميل", "Install", "وين أحمّل التطبيق؟", "Where do I get the app?",
    "افتح التطبيق من الزر فوق، وعلى الآيفون اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية»، وبعدها تشتغل الإشعارات حتى والتطبيق مقفول. نسخ آيفون وأندرويد التجريبية على الطلب من المطوّر.",
    "Open the app with the button above; on iPhone tap Share, then “Add to Home Screen”, and notifications work even when it's closed. iPhone and Android preview builds are available from the developer on request."],
  ["server", "السيرفر", "Server", "ليش أحيانًا ما يفتح؟", "Why does it sometimes not open?",
    "السيرفر مستضاف ذاتيًا على جهاز واحد في البيت، فممكن يتوقف مؤقتًا لو الجهاز نام أو انقطع النت. حسابك ورسائلك ما تضيع، وترجع لك لما يشتغل.",
    "The server is self-hosted on one computer at home, so it can pause when that computer sleeps or loses internet. Your account and messages aren't lost; they come back when it's up."],
];
const faqHtml = faq.map(([ic, ta, te, qa, qe, aa, ae], i) => `
      <details class="icard c${i % 6}" name="faq"${i === 0 ? " open" : ""}>
        <summary><span class="av">${icon(ic)}</span><span class="qt"><span class="tab">${L(ta, te)}</span><span class="q">${L(qa, qe)}</span></span><span class="chev" aria-hidden="true"></span></summary>
        <p class="a">${L(aa, ae)}</p>
      </details>`).join("");

const facts = [
  ["lock", "مشفّرة", "Encrypted", "الرسائل والصور والملفات والتسجيلات تُشفَّر على جهازك قبل ما تطلع.", "Messages, photos, files and voice notes are encrypted on your device before they leave."],
  ["hash", "بدون جوال", "No phone number", "رقمك mell- من 6 أرقام يغنيك عن رقم الجوال والإيميل.", "A six-digit mell- number replaces your phone number and email."],
  ["noads", "بدون إعلانات", "No ads", "ولا تتبّع، ولا خلاصة عشوائية.", "No tracking and no random feed."],
  ["kids", "وضع الأطفال", "Kids Mode", "ولي الأمر يوافق على من يتواصل معهم الطفل.", "A guardian approves who a child can talk to."],
];
const factsHtml = facts.map(([ic, a, e, da, de], i) => `
    <li class="f${i}" data-rise data-d="${i}"><span class="av">${icon(ic)}</span><p class="fact">${L(a, e)}</p><p class="fact-note">${L(da, de)}</p></li>`).join("");

const heroFacts = [["مشفّرة من طرف إلى طرف", "End-to-end encrypted"], ["بدون رقم جوال", "No phone number"], ["بدون إعلانات", "No ads"]];
const heroFactsHtml = heroFacts.map(([a, e], i) => `
        <li class="km${i === 1 ? " own" : ""}" data-rise data-d="${i + 1}"><span class="km-text">${L(a, e)}</span>${icon("check", "ic km-ok")}</li>`).join("");

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="boot.js"></script>
<title>آي ميلو — خلّك قريب من اللي تحبهم | iMello</title>
<meta name="description" content="آي ميلو: تطبيق مراسلة للعائلة. رسائل وصور ومكالمات مشفّرة من طرف إلى طرف، رقم mell- بدل رقم الجوال، ووضع للأطفال بموافقة ولي الأمر. بدون إعلانات ولا تتبّع.">
<meta name="theme-color" content="#1F64AC" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#173B63" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'">
<meta property="og:type" content="website">
<meta property="og:title" content="آي ميلو — Stay Close. Feel Connected.">
<meta property="og:description" content="مراسلة عائلية مشفّرة، بدون رقم جوال، بدون إعلانات.">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<link rel="preload" href="fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="style.css">
</head>
<body>
<a class="skip" href="#features">${L("إلى المحتوى", "Skip to content")}</a>
<header class="top">
  <div class="top-in">
    <a class="brand" href="#top"><img src="favicon.svg" width="36" height="36" alt=""><span>iMello</span></a>
    <nav class="top-nav" aria-label="Main">
      <a href="#features">${L("المزايا", "Features")}</a>
      <a href="#how">${L("كيف يشتغل", "How it works")}</a>
      <a href="#faq">${L("أسئلة", "Questions")}</a>
    </nav>
    <button type="button" class="lang" id="lang" aria-label="EN — عرض الصفحة بالإنجليزية" data-ar="EN — عرض الصفحة بالإنجليزية" data-en="عربي — Switch to Arabic" data-attr="aria-label"><span data-l="ar" lang="en">EN</span><span data-l="en" lang="ar">عربي</span></button>
    <a class="btn" href="app/">${L("افتح التطبيق", "Open the app")}</a>
  </div>
</header>
<main>
<section class="hero" id="top">
  <div class="hero-in">
    <div class="hero-text">
      <h1 class="hero-title"><span class="l1" data-rise>${L("خلّك قريب", "Stay close.")}</span><span class="l2" data-rise data-d="1">${L("من اللي تحبهم", "Feel connected.")}</span></h1>
      <ul class="card-facts">${heroFactsHtml}
      </ul>
    </div>
    <div class="card" data-rise data-d="1">
      <div class="card-head"><img class="card-logo" src="favicon.svg" width="40" height="40" alt=""><p class="card-name" id="cardname" data-ar="اسمك" data-en="Your name">اسمك</p></div>
      <div class="card-num">
        <p class="card-label">${L("رقمك في آي ميلو", "Your iMello number")}</p>
        <p class="number" dir="ltr" aria-live="polite">mell-<span id="num">482913</span></p>
      </div>
      <form class="card-form" id="cardform" autocomplete="off">
        <label class="sr" for="nm">${L("اكتب اسمك", "Type your name")}</label>
        <input id="nm" name="nm" type="text" maxlength="24" placeholder="اكتب اسمك" data-ph-ar="اكتب اسمك" data-ph-en="Type your name" enterkeyhint="done">
        <button type="button" class="again" id="again">${L("رقم ثاني", "Another number")}</button>
      </form>
      <p class="card-note">${L("مثال فقط. رقمك الحقيقي يطلع لك أول ما تبدأ.", "An example only. Your real number appears when you start.")}</p>
    </div>
  </div>
</section>

<section class="intro" aria-labelledby="intro-h">
  <div class="wrap">
    <div class="intro-row">
      <h2 id="intro-h" class="intro-h" data-rise>${L("مراسلة لعائلتك", "A messenger for family")}</h2>
      <p class="intro-note" data-rise data-d="1">${L("تطبيق للعائلة والأصحاب المقرّبين. تبدأ بضغطة، تشارك رقمك، وكل شي بينكم يبقى بينكم.", "An app for family and close friends. Start with one tap, share your number, and what's between you stays between you.")}</p>
    </div>
    <ul class="facts">${factsHtml}
    </ul>
  </div>
</section>

<section class="features" id="features" aria-labelledby="feat-h">
  <div class="wrap">
    <h2 id="feat-h" class="feat-h" data-rise>${L("كل اللي تحتاجه، بدون الزيادات", "Everything you need, nothing extra")}</h2>
    <div class="stack">${sheetHtml}
    </div>
  </div>
</section>

<section class="how" id="how" aria-labelledby="how-h">
  <div class="wrap how-in">
    <div class="how-text">
      <h2 id="how-h" class="how-h" data-rise>${L("كيف يشتغل", "How it works")}</h2>
      <p data-rise data-d="1">${L("ثلاث خطوات، بدون إيميل ولا رقم جوال.", "Three steps, no email and no phone number.")}</p>
    </div>
    <div class="slip" data-rise data-d="1">${slipHtml}
      <p class="slip-end"><span>${L("النتيجة: محادثة مشفّرة مع من تحب", "Result: an encrypted chat with the people you love")}</span></p>
    </div>
  </div>
</section>

<section class="faq" id="faq" aria-labelledby="faq-h">
  <div class="wrap faq-in">
    <h2 id="faq-h" class="faq-h" data-rise>${L("أسئلة وأجوبة صريحة", "Straight answers")}</h2>
    <div class="cards">${faqHtml}
    </div>
  </div>
</section>

<section class="cta" aria-labelledby="cta-h">
  <form class="cta-form wrap" id="ctaform" action="app/" autocomplete="off">
    <h2 id="cta-h" class="cta-sentence" data-rise>
      <label for="cta-name">${L("اسمي", "My name is")}</label>
      <input id="cta-name" type="text" maxlength="24" placeholder="اسمك" data-ph-ar="اسمك" data-ph-en="your name">
      <span>${L("وأبي", "and I'd like to")}</span>
      <button type="submit" class="go"><span>${L("أبدأ", "start")}</span>${icon("send", "ic go-ic")}</button>
    </h2>
    <p class="cta-after" data-rise data-d="1">${L("يفتح التطبيق وتاخذ رقمك على طول. ما نطلب إيميل ولا رقم جوال.", "This opens the app and you get your number straight away. We don't ask for an email or a phone number.")}</p>
  </form>
</section>
</main>

<footer class="foot">
  <div class="tiles wrap">
    <div class="tile t-state"><p class="t-big">${L("آي ميلو نسخة تجريبية: ما راجعه طرف أمني مستقل بعد.", "iMello is a preview: it hasn't had an independent security review yet.")}</p><p class="t-legal">${L("© 2026 آي ميلو. تطوير abu00salman.", "© 2026 iMello. Developed by abu00salman.")}</p></div>
    <nav class="tile t-nav" aria-label="Footer"><a href="#features">${L("المزايا", "Features")}</a><a href="#how">${L("كيف يشتغل", "How it works")}</a><a href="#faq">${L("أسئلة", "Questions")}</a><a href="https://abu00salman.github.io/rm/" rel="noopener">${L("عن المطوّر", "About the developer")}</a></nav>
    <div class="tile t-time"><p class="t-label">${L("الرياض", "Riyadh")}</p><p class="t-clock" id="clock" dir="ltr">--:--</p></div>
    <a class="tile t-mail" href="mailto:abu00salman@yahoo.com"><span dir="ltr">abu00salman@yahoo.com</span></a>
    <div class="tile t-word"><p class="wordmark" dir="ltr">iMello</p><div class="theme" id="theme" role="group" aria-label="Colour theme" data-ar="ألوان الصفحة" data-en="Colour theme" data-attr="aria-label"><button type="button" class="th th-cb" data-set="classic-blue" aria-pressed="true"><span class="sw" aria-hidden="true"></span>${L("الأزرق الكلاسيكي", "Classic Blue")}</button><button type="button" class="th th-co" data-set="coral" aria-pressed="false"><span class="sw" aria-hidden="true"></span>${L("المرجاني", "Coral")}</button></div></div>
    <a class="tile t-open" href="app/"><span>${L("افتح التطبيق", "Open the app")}</span>${icon("arrow", "ic t-arrow")}</a>
  </div>
</footer>
<script src="app.js" defer></script>
</body>
</html>
`;
writeFileSync(new URL("./index.html", import.meta.url), html);
process.stdout.write(`index.html ${html.length} bytes\n`);
