// Generates index.html (Arabic + English in one document). Run: node build.mjs
import { writeFileSync } from "node:fs";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const L = (ar, en) => `<span data-l="ar">${esc(ar)}</span><span data-l="en">${esc(en)}</span>`;

const sheets = [
  { cls: "s1", img: "chat-dark.jpg", video: true, w: 640, h: 1066, ar: ["رسائل مشفّرة", "نص وصور وملفات وتسجيلات صوتية، تُشفَّر على جهازك قبل ما تطلع. السيرفر يحفظ نصًا مشفّرًا فقط."], en: ["Encrypted chats", "Text, photos, files and voice notes are encrypted on your device before they leave. The server only ever stores ciphertext."], alt: ["محادثة حقيقية في آي ميلو", "A real chat in iMello"] },
  { cls: "s2", img: "call.jpg", w: 640, h: 1066, ar: ["مكالمات صوت وفيديو", "اتصل بأهلك صوت أو فيديو من نفس المحادثة. الصوت والصورة يمرّون بين الجهازين مباشرة."], en: ["Voice and video calls", "Call family by voice or video from the same chat. Audio and picture go straight between the two devices."], alt: ["شاشة مكالمة واردة", "An incoming call"] },
  { cls: "s3", img: "settings.jpg", w: 640, h: 1066, ar: ["رقمك بدل رقم الجوال", "تاخذ رقمًا مثل mell-482913 تشاركه مع أهلك وأصحابك. ما نطلب رقم جوال ولا إيميل."], en: ["A number, not your phone number", "You get a number like mell-482913 to share with family and friends. We never ask for a phone number or an email."], alt: ["رقمك في الإعدادات", "Your number in Settings"] },
  { cls: "s4", img: "list.jpg", w: 640, h: 1066, ar: ["بدون إعلانات ولا تتبّع", "ما فيه إعلانات، ولا خلاصة عشوائية، ولا تتبّع. النسخة الاحتياطية لمفاتيحك ملف على جوالك أنت، ولا تنرفع لأي مكان."], en: ["No ads, no tracking", "No ads, no feed, no tracking. Your key backup is a file on your own phone and is never uploaded anywhere."], alt: ["قائمة المحادثات", "The chat list"] },
  { cls: "s5", img: null, ar: ["وضع الأطفال", "ولي الأمر يضيف حساب الطفل ويوافق على من يتواصل معهم. الطفل ما يستقبل طلبات من الغرباء. هذا مفروض من السيرفر، مو من الواجهة بس."], en: ["Kids Mode", "A guardian creates the child's account and approves who they can talk to. Strangers can't reach a child. The server enforces it, not just the interface."], big: ["مع من توافق عليه فقط", "Only people you approve"] },
];
const sheetHtml = sheets.map((s) => `
    <article class="sheet ${s.cls}">
      <h3 class="sheet-name">${L(s.ar[0], s.en[0])}</h3>
      <p class="sheet-text">${L(s.ar[1], s.en[1])}</p>
      ${s.video ? `<video class="sheet-img" width="390" height="844" muted loop playsinline preload="none" poster="img/chat-poster.jpg" aria-label="${esc(s.alt[0])}" data-ar="${esc(s.alt[0])}" data-en="${esc(s.alt[1])}" data-attr="aria-label"><source src="img/chat.webm" type="video/webm"><source src="img/chat.mp4" type="video/mp4"></video>`
      : s.img ? `<img class="sheet-img" src="img/${s.img}" width="${s.w}" height="${s.h}" alt="${esc(s.alt[0])}" data-ar="${esc(s.alt[0])}" data-en="${esc(s.alt[1])}" data-attr="alt" loading="lazy" decoding="async">`
              : `<p class="sheet-big">${L(s.big[0], s.big[1])}</p>`}
    </article>`).join("");

const slip = [
  ["أول مرة", "The first time", [["تضغط «ابدأ الآن»", "Tap “Start now”", "بدون تسجيل", "no sign-up"], ["تاخذ رقمك mell-", "You get your mell- number", "فورًا", "instantly"]]],
  ["تضيف أهلك", "Add your people", [["تشارك رقمك أو تكتب رقمهم", "Share your number or type theirs", "ضغطة", "one tap"], ["هم يقبلون الطلب", "They accept the request", "منهم", "on their side"]]],
  ["بعدها", "Then", [["تراسلهم نص وصور وصوت ومكالمات", "Message, send photos and voice, call", "مشفّرة", "encrypted"], ["تحمي حسابك بكلمة سر", "Protect your account with a password", "اختياري", "optional"], ["تحفظ نسخة مفاتيحك على جوالك", "Save a key backup on your phone", "اختياري", "optional"]]],
];
const slipHtml = slip.map(([ha, he, rows]) => `
          <h4 class="slip-h">${L(ha, he)}</h4>
          ${rows.map(([a, e, va, ve]) => `<p class="slip-row"><span class="slip-what">${L(a, e)}</span><span class="dots" aria-hidden="true"></span><span class="slip-val">${L(va, ve)}</span></p>`).join("")}`).join("");

const faq = [
  ["الأمان", "Security", "هل رسائلي مشفّرة فعلًا؟", "Are my messages really encrypted?",
    "نعم: الرسائل والصور والملفات والتسجيلات تُشفَّر من طرف إلى طرف، والسيرفر ما يشوف إلا نصًا مشفّرًا. لكن آي ميلو لسا نسخة تجريبية، وما راجعه طرف أمني مستقل بعد. لا تعتمد عليه في اتصالات عالية الخطورة.",
    "Yes: messages, photos, files and voice notes are end-to-end encrypted, and the server only sees ciphertext. But iMello is still a preview and hasn't had an independent security review. Don't rely on it for high-risk communication."],
  ["الجوال", "Phone", "وش يصير لو ضاع جوالي؟", "What if I lose my phone?",
    "لو ما حطيت كلمة سر لحسابك، الحساب مربوط بالجهاز وينفقد معه. احمِ حسابك بكلمة سر من الإعدادات، واحفظ نسخة المفاتيح على جوالك: الرسائل القديمة ما ترجع بدونها.",
    "If you haven't set a password, the account is tied to the device and is lost with it. Protect your account from Settings and keep a key backup on your phone: old messages can't come back without it."],
  ["الأطفال", "Kids", "كيف يشتغل وضع الأطفال؟", "How does Kids Mode work?",
    "ولي الأمر ينشئ حساب الطفل ويوافق على جهات الاتصال. أي طلب لطفل يروح لولي الأمر أول، والسيرفر يرفض أي تواصل ما وافق عليه.",
    "A guardian creates the child's account and approves contacts. Any request to a child goes to the guardian first, and the server rejects contact that wasn't approved."],
  ["الخصوصية", "Privacy", "هل فيه إعلانات أو تتبّع؟", "Are there ads or tracking?",
    "لا. ما فيه إعلانات ولا تحليلات تتبّع. الإشعارات ما تعرض نص الرسالة، وتقدر تطفيها.",
    "No. There are no ads and no tracking analytics. Notifications never show message text, and you can turn them off."],
  ["التحميل", "Install", "وين أحمّل التطبيق؟", "Where do I get the app?",
    "افتح التطبيق من الزر فوق، وعلى الآيفون اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية»، وبعدها تشتغل الإشعارات حتى والتطبيق مقفول. نسخ آيفون وأندرويد التجريبية على الطلب من المطوّر.",
    "Open the app with the button above; on iPhone tap Share, then “Add to Home Screen”, and notifications work even when it's closed. iPhone and Android preview builds are available from the developer on request."],
  ["السيرفر", "Server", "ليش أحيانًا ما يفتح؟", "Why does it sometimes not open?",
    "السيرفر مستضاف ذاتيًا على جهاز واحد في البيت، فممكن يتوقف مؤقتًا لو الجهاز نام أو انقطع النت. حسابك ورسائلك ما تضيع، وترجع لك لما يشتغل.",
    "The server is self-hosted on one computer at home, so it can pause when that computer sleeps or loses internet. Your account and messages aren't lost; they come back when it's up."],
];
const faqHtml = faq.map(([ta, te, qa, qe, aa, ae], i) => `
      <details class="icard c${i % 3}" name="faq"${i === 0 ? " open" : ""}>
        <summary><span class="tab">${L(ta, te)}</span><span class="q">${L(qa, qe)}</span></summary>
        <p class="a">${L(aa, ae)}</p>
      </details>`).join("");

const facts = [
  ["مشفّرة", "Encrypted", "الرسائل والصور والملفات والتسجيلات تُشفَّر على جهازك قبل ما تطلع.", "Messages, photos, files and voice notes are encrypted on your device before they leave."],
  ["بدون جوال", "No phone number", "رقمك mell- من ٦ أرقام يغنيك عن رقم الجوال والإيميل.", "A six-digit mell- number replaces your phone number and email."],
  ["بدون إعلانات", "No ads", "ولا تتبّع، ولا خلاصة عشوائية.", "No tracking and no random feed."],
  ["وضع الأطفال", "Kids Mode", "ولي الأمر يوافق على من يتواصل معهم الطفل.", "A guardian approves who a child can talk to."],
];
const factsHtml = facts.map(([a, e, da, de]) => `
        <li><p class="fact">${L(a, e)}</p><p class="fact-note">${L(da, de)}</p></li>`).join("");

const arrow = `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><path d="M40 8 8 40M16 8h24v24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="square"/></svg>`;

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="boot.js"></script>
<title>آي ميلو — خلّك قريب من اللي تحبهم | iMello</title>
<meta name="description" content="آي ميلو: تطبيق مراسلة للعائلة. رسائل وصور ومكالمات مشفّرة من طرف إلى طرف، رقم mell- بدل رقم الجوال، ووضع للأطفال بموافقة ولي الأمر. بدون إعلانات ولا تتبّع.">
<meta name="theme-color" content="#0f1521">
<meta name="color-scheme" content="dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'">
<meta property="og:type" content="website">
<meta property="og:title" content="آي ميلو — Stay Close. Feel Connected.">
<meta property="og:description" content="مراسلة عائلية مشفّرة، بدون رقم جوال، بدون إعلانات.">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<link rel="preload" href="fonts/readex-pro-arabic-500-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="style.css">
</head>
<body>
<a class="skip" href="#features"><span data-l="ar">إلى المحتوى</span><span data-l="en">Skip to content</span></a>
<main>
<header class="top">
  <a class="brand" href="#top"><img src="favicon.svg" width="36" height="36" alt=""><span>iMello</span></a>
  <nav class="top-nav" aria-label="Main">
    <a href="#features">${L("المزايا", "Features")}</a>
    <a href="#how">${L("كيف يشتغل", "How it works")}</a>
    <a href="#faq">${L("أسئلة", "Questions")}</a>
    <button type="button" class="lang" id="lang" aria-label="Switch language"><span data-l="ar" lang="en">EN</span><span data-l="en" lang="ar">عربي</span></button>
  </nav>
  <a class="btn" href="app/">${L("افتح التطبيق", "Open the app")}</a>
</header>

<section class="hero" id="top">
  <div class="card-wrap">
    <div class="card">
      <i class="sc a"></i><i class="sc b"></i><i class="sc c"></i><i class="sc d"></i>
      <img class="card-logo" src="favicon.svg" width="56" height="56" alt="">
      <h1 class="card-title"><span class="l1" data-rise>${L("خلّك قريب", "Stay close.")}</span><span class="l2" data-rise data-d="1">${L("من اللي تحبهم", "Feel connected.")}</span></h1>
      <div class="card-num" data-rise data-d="2">
        <p class="number" dir="ltr" aria-live="polite">mell-<span id="num">482913</span></p>
        <p class="card-label">${L("رقمك في آي ميلو", "Your iMello number")}</p>
        <p class="card-name" id="cardname" data-ar="اسمك" data-en="Your name">اسمك</p>
      </div>
      <form class="card-form" id="cardform" data-rise data-d="3" autocomplete="off">
        <label class="sr" for="nm">${L("اكتب اسمك", "Type your name")}</label>
        <input id="nm" name="nm" type="text" maxlength="24" placeholder="اكتب اسمك" data-ph-ar="اكتب اسمك" data-ph-en="Type your name" enterkeyhint="done">
        <button type="button" class="again" id="again">${L("رقم ثاني", "Another number")}</button>
      </form>
      <p class="card-note" data-rise data-d="3">${L("مثال فقط. رقمك الحقيقي يطلع لك أول ما تبدأ.", "An example only. Your real number appears when you start.")}</p>
      <ul class="card-facts">
        <li>${L("مشفّرة من طرف إلى طرف", "End-to-end encrypted")}</li>
        <li>${L("بدون رقم جوال", "No phone number")}</li>
        <li>${L("بدون إعلانات", "No ads")}</li>
      </ul>
    </div>
  </div>
</section>

<section class="intro" aria-labelledby="intro-h">
  <div class="intro-row">
    <h2 id="intro-h" class="intro-h" data-rise>${L("مراسلة لعائلتك", "A messenger for family")}</h2>
    <p class="intro-note" data-rise data-d="1">${L("تطبيق للعائلة والأصحاب المقرّبين. تبدأ بضغطة، تشارك رقمك، وكل شي بينكم يبقى بينكم.", "An app for family and close friends. Start with one tap, share your number, and what's between you stays between you.")}</p>
  </div>
  <ul class="facts">${factsHtml}
  </ul>
</section>

<section class="features" id="features" aria-labelledby="feat-h">
  <h2 id="feat-h" class="feat-h" data-rise>${L("كل اللي تحتاجه، بدون الزيادات", "Everything you need, nothing extra")}</h2>
  <div class="stack">${sheetHtml}
  </div>
</section>

<section class="how" id="how" aria-labelledby="how-h">
  <div class="how-text">
    <h2 id="how-h" class="how-h" data-rise>${L("كيف يشتغل", "How it works")}</h2>
    <p data-rise data-d="1">${L("ثلاث خطوات، بدون إيميل ولا رقم جوال.", "Three steps, no email and no phone number.")}</p>
  </div>
  <div class="slip" data-rise data-d="1">${slipHtml}
    <p class="slip-end"><span>${L("النتيجة: محادثة مشفّرة مع من تحب", "Result: an encrypted chat with the people you love")}</span></p>
  </div>
</section>

<section class="faq" id="faq" aria-labelledby="faq-h">
  <h2 id="faq-h" class="faq-h" data-rise>${L("أسئلة وأجوبة صريحة", "Straight answers")}</h2>
  <div class="cards">${faqHtml}
  </div>
</section>

<section class="cta" aria-labelledby="cta-h">
  <form class="cta-form" id="ctaform" action="app/" autocomplete="off">
    <h2 id="cta-h" class="cta-sentence" data-rise>
      <label for="cta-name">${L("اسمي", "My name is")}</label>
      <input id="cta-name" type="text" maxlength="24" placeholder="اسمك" data-ph-ar="اسمك" data-ph-en="your name">
      <span>${L("وأبي", "and I'd like to")}</span>
      <button type="submit" class="go">${L("أبدأ", "start")}</button>
    </h2>
    <p class="cta-after" data-rise data-d="1">${L("يفتح التطبيق وتاخذ رقمك على طول. ما نطلب إيميل ولا رقم جوال.", "This opens the app and you get your number straight away. We don't ask for an email or a phone number.")}</p>
  </form>
</section>
</main>

<footer class="foot">
  <div class="tiles">
    <div class="tile t-state"><p class="t-big">${L("آي ميلو نسخة تجريبية: ما راجعه طرف أمني مستقل بعد.", "iMello is a preview: it hasn't had an independent security review yet.")}</p><p class="t-legal">${L("© 2026 آي ميلو. تطوير abu00salman.", "© 2026 iMello. Developed by abu00salman.")}</p></div>
    <nav class="tile t-nav" aria-label="Footer"><a href="#features">${L("المزايا", "Features")}</a><a href="#how">${L("كيف يشتغل", "How it works")}</a><a href="#faq">${L("أسئلة", "Questions")}</a><a href="https://abu00salman.github.io/rm/" rel="noopener">${L("عن المطوّر", "About the developer")}</a></nav>
    <div class="tile t-time"><p class="t-label">${L("الرياض", "Riyadh")}</p><p class="t-clock" id="clock" dir="ltr">--:--</p></div>
    <a class="tile t-mail" href="mailto:abu00salman@yahoo.com"><span dir="ltr">abu00salman@yahoo.com</span></a>
    <div class="tile t-word"><p class="wordmark" dir="ltr">iMello</p></div>
    <a class="tile t-open" href="app/"><span>${L("افتح التطبيق", "Open the app")}</span>${arrow}</a>
  </div>
</footer>
<script src="app.js" defer></script>
</body>
</html>
`;
writeFileSync(new URL("./index.html", import.meta.url), html);
process.stdout.write(`index.html ${html.length} bytes\n`);
