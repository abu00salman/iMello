/* Wanas landing: language, theme, the live number card, entrances. No libraries; the page works without this file. */
(() => {
  const root = document.documentElement;
  const mq = (q) => window.matchMedia && matchMedia(q);
  const reduced = !!(mq("(prefers-reduced-motion: reduce)") || {}).matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  /* Language: shares the app's key so the choice carries into the app. */
  const TITLE = { ar: "ونس — خلّك قريب من اللي تحبهم | Wanas", en: "Wanas — Stay close. Feel connected." };
  function setLang(l) {
    root.lang = l; root.dir = l === "ar" ? "rtl" : "ltr";
    document.title = TITLE[l];
    $$("[data-attr]").forEach((el) => el.setAttribute(el.dataset.attr, el.dataset[l]));
    $$("[data-ph-ar]").forEach((el) => { el.placeholder = el.dataset[l === "ar" ? "phAr" : "phEn"]; });
    const name = $("#cardname");
    if (name && !name.dataset.typed) name.textContent = name.dataset[l];
    store.set("imello.locale", l);
  }
  setLang(root.lang === "en" ? "en" : "ar");
  $("#lang")?.addEventListener("click", () => setLang(root.lang === "ar" ? "en" : "ar"));

  /* Theme: Classic Blue (default) or Coral. Light/dark follows the OS for both. Colours only; layout never changes. */
  const dark = mq("(prefers-color-scheme: dark)");
  const syncMode = () => {
    /* tokens.css has an Automatic block only for Classic Blue; for Coral we mirror the OS here. A ?mode= override wins. */
    if (/[?&]mode=(light|dark)\b/.test(location.search)) return;
    if (root.dataset.theme === "coral") root.dataset.mode = dark && dark.matches ? "dark" : "light";
    else delete root.dataset.mode;
  };
  syncMode();
  dark?.addEventListener?.("change", syncMode);
  const pressed = () => $$("#theme [data-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.set === (root.dataset.theme || "classic-blue"))));
  pressed();
  $$("#theme [data-set]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.set === "coral") root.dataset.theme = "coral"; else delete root.dataset.theme;
    store.set("imello.site.theme", b.dataset.set);
    syncMode(); pressed();
  }));

  /* The live card: your name and a sample number. Nothing is sent anywhere. */
  const num = $("#num"), cardName = $("#cardname"), nm = $("#nm"), again = $("#again");
  const ctaName = $("#cta-name");
  const roll = () => { if (num) num.textContent = String(Math.floor(Math.random() * 10_000)).padStart(4, "0"); };
  roll();
  nm?.addEventListener("input", () => {
    const v = nm.value.trim();
    cardName.dataset.typed = v ? "1" : "";
    cardName.textContent = v || cardName.dataset[root.lang];
    if (ctaName && !ctaName.dataset.edited) ctaName.value = v;
  });
  again?.addEventListener("click", roll);
  $("#cardform")?.addEventListener("submit", (e) => e.preventDefault());

  /* "My name is ___ and I'd like to start": the name is handed to the app's sign-up field. */
  ctaName?.addEventListener("input", () => { ctaName.dataset.edited = "1"; });
  $("#ctaform")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = (ctaName?.value || nm?.value || "").trim().slice(0, 24);
    if (v) store.set("imello.prefillName", v);
    location.href = "app/";
  });

  /* Riyadh time tile */
  const clock = $("#clock");
  const tick = () => { if (clock) clock.textContent = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date()); };
  tick(); setInterval(tick, 20_000);

  /* FAQ: one card open at a time even where <details name> isn't supported. */
  $$("details.icard").forEach((d) => d.addEventListener("toggle", () => { if (d.open) $$("details.icard").forEach((o) => { if (o !== d) o.open = false; }); }));

  /* Entrances (motion-spec: 160ms-class, ease-out, opacity + small rise, no bounce).
     Content is visible by default: only elements that start BELOW the fold are hidden, and only when motion is allowed,
     IntersectionObserver exists and the page is not being captured (automation / print), so full-page screenshots,
     no-JS, print and reduced motion all show everything. */
  const targets = $$("[data-rise]");
  const captured = navigator.webdriver === true || /[?&]static(&|=|$)/.test(location.search);
  const showAll = () => targets.forEach((el) => { el.classList.remove("pre"); el.classList.add("in"); });
  if (reduced || captured || !("IntersectionObserver" in window)) {
    showAll();
  } else {
    const fold = window.innerHeight;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); e.target.classList.remove("pre"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    targets.forEach((el) => {
      if (el.getBoundingClientRect().top < fold) el.classList.add("in", "first");
      else { el.classList.add("pre"); io.observe(el); }
    });
    window.addEventListener("beforeprint", showAll);
  }

  /* The moving picture is a real recording of the app; it plays only while on screen, and not at all with reduced motion. */
  const clip = $("video.sheet-img");
  if (clip && !reduced && "IntersectionObserver" in window) {
    new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) clip.play().catch(() => {}); else clip.pause(); }), { threshold: 0.35 }).observe(clip);
  }
})();
