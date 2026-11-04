/* Existing links and installs open the app, not this page: invite/notification links (#/…), the Home Screen app,
   the native iMello app, and people who already use iMello in this browser. Add ?landing to see this page anyway. */
(function () {
  var go = /^#\//.test(location.hash) || /iMelloApp/.test(navigator.userAgent) ||
    (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  try { if (!go && localStorage.getItem("imello.returning") === "1" && !/[?&]landing(&|=|$)/.test(location.search)) go = true; } catch { /* storage unavailable */ }
  if (go) location.replace("app/" + location.hash);
  document.documentElement.classList.add("js");
  try { if (localStorage.getItem("imello.locale") === "en") { document.documentElement.lang = "en"; document.documentElement.dir = "ltr"; } } catch { /* storage unavailable */ }
})();
