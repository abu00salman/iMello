# iMello 2.0 — Performance measurements

All numbers below were **measured**, not estimated, with `tests/e2e/browser/perf.bench.spec.ts`
(`BENCH=1 BENCH_LABEL=<label> npx playwright test perf.bench`).

**Test conditions:** headless Chromium (Playwright 1.63), 390×844 viewport, production web build served by
`vite preview`, local dev stack (Synapse + iMello API + PostgreSQL 16 on the same Linux container, no
Cloudflare/Tunnel in the path), one encrypted 1:1 conversation with 300 messages received after the browser
device signed in. Each timing is the mean of 3 runs unless noted. Not measured: real iPhone/Android devices, the
iOS WebView, mobile networks, the public Cloudflare path — see "Not yet measured".

| Metric | Before (`266654b`) | After (iMello 2.0) |
| --- | --- | --- |
| Session restore: reload → chat list visible | 942 ms | 572–629 ms |
| Open the 300-message conversation (mean of 3) | **18 633 ms** | **107 ms** |
| — first open after reopening the app | (included above) | 142 ms |
| — repeat open | (included above) | 89–126 ms |
| DOM nodes with the conversation open | 2 792 | 362 |
| Main-thread long tasks (>50 ms) while 40 messages arrive | **35 (2 732 ms total, max 158 ms)** | **0** |
| Time for 40 incoming messages to all appear | 6 074 ms | 3 920–4 458 ms (sender-bound) |

## Root causes found (with evidence) and fixes

1. **Whole-conversation re-render on every sync tick.** Each Matrix event (including every decryption) bumped a
   version counter once per animation frame, and every bump re-rendered *all* message bubbles. During a burst this
   produced a long task almost every frame (35 long tasks for 40 messages).
   *Fix:* refreshes coalesced to ≤ 1 per 120 ms; message rows are memoised so only changed rows re-render;
   encryption-state lookups no longer run on every tick.
2. **Unbounded DOM.** All messages were rendered. *Fix:* only the newest 50 are rendered; older pages are added
   when you scroll up (and fetched from the server when local history runs out), keeping your reading position.
3. **Chat list converted every message of every room to find the last one.** *Fix:* reads the newest displayable
   event only.
4. **Stale initial sync on reopen (server).** Synapse caches initial `/sync` responses for 2 minutes by default.
   Reopening the app within that window started from an old snapshot and then replayed every newer message through
   incremental syncs, decrypting them oldest-first before the newest became visible (first open: 8–16 s even after
   the client fixes). Proven by toggling only this setting: 8 390 ms → 142 ms.
   *Fix:* `caches.sync_response_cache_duration: 0` (template updated; **must be added on the Mac** — see
   DOCKER_OPERATIONS.md).
5. **Smooth-scrolling on every new message and history-fetch chain on open.** *Fix:* jump only when you are at the
   bottom (or sent the message); older history loads only on a real user scroll.
6. **Glass compositing cost.** Removed backdrop blur from cards, lists, bubbles and date chips (kept on the three
   floating bars only); the animated full-screen aurora was already made static.

## Not yet measured (needs real devices or the live server)

- Cold/warm start and scrolling FPS on iPhone (Safari, Home Screen web app, iOS WebView) and Android.
- Latency through Cloudflare Tunnel from Wi-Fi vs. mobile data; Matrix sync latency on the live server.
- Container CPU/RAM and PostgreSQL latency under load on the MacBook Air.
Use `/health/deep` (database and homeserver latency) and the commands in DOCKER_OPERATIONS.md to collect these.
