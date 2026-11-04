/* iMello landing: language, the live ID card, entrances. No libraries; the page works without this file. */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  /* Language: shares the app's key so the choice carries into the app. */
  const TITLE = { ar: "آي ميلو — خلّك قريب من اللي تحبهم | iMello", en: "iMello — Stay close. Feel connected." };
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

  /* The live card: your name and a sample number. Nothing is sent anywhere. */
  const num = $("#num"), cardName = $("#cardname"), nm = $("#nm"), again = $("#again");
  const roll = () => { if (num) num.textContent = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"); };
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
  const ctaName = $("#cta-name");
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

  /* Entrances */
  const targets = $$("[data-rise], .sheet");
  if (reduced || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    targets.forEach((el) => io.observe(el));
  }

  /* The moving picture is a real recording of the app; it plays only while on screen, and not at all with reduced motion. */
  const clip = $("video.sheet-img");
  if (clip && !reduced && "IntersectionObserver" in window) {
    new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) clip.play().catch(() => {}); else clip.pause(); }), { threshold: 0.35 }).observe(clip);
  }
})();
