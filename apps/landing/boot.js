/* Existing links and installs open the app, not this page: invite/notification links (#/…), the Home Screen app,
   the native Wanas app, and people who already use Wanas in this browser. Add ?landing to see this page anyway. */
(function () {
  var go = /^#\//.test(location.hash) || /(iMello|Wanas)App/.test(navigator.userAgent) ||
    (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  try { if (!go && localStorage.getItem("imello.returning") === "1" && !/[?&]landing(&|=|$)/.test(location.search)) go = true; } catch { /* storage unavailable */ }
  if (go) location.replace("app/" + location.hash);
  var root = document.documentElement;
  root.classList.add("js");
  try { if (localStorage.getItem("imello.locale") === "en") { root.lang = "en"; root.dir = "ltr"; } } catch { /* storage unavailable */ }
  /* Preload the Arabic fonts only when the page opens in Arabic (Inter is preloaded in the HTML). External script, so the CSP stays strict. */
  if (root.lang !== "en") ["700", "400"].forEach(function (w) {
    var l = document.createElement("link");
    l.rel = "preload"; l.as = "font"; l.type = "font/woff2"; l.crossOrigin = "anonymous";
    l.href = "fonts/ibm-plex-sans-arabic-arabic-" + w + "-normal.woff2";
    document.head.appendChild(l);
  });
  /* Theme (design v0.3.1): no data-theme = Classic Blue + Automatic (tokens.css follows prefers-color-scheme).
     Coral is the alternative theme. ?theme=coral|classic-blue and ?mode=light|dark override for previews. */
  var q = location.search, theme = null, mode = null;
  try { theme = localStorage.getItem("imello.site.theme"); } catch { /* storage unavailable */ }
  var mt = /[?&]theme=(coral|classic-blue)\b/.exec(q); if (mt) theme = mt[1];
  var mm = /[?&]mode=(light|dark)\b/.exec(q); if (mm) mode = mm[1];
  if (theme === "coral") root.setAttribute("data-theme", "coral");
  if (!mode && theme === "coral" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) mode = "dark";
  if (mode) root.setAttribute("data-mode", mode);
})();
