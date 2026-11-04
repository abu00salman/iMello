# Native iMello client

Status: **accepted for the test build**. The mobile app is a native React Native interface. It does not display a web page.

## Decision

Two ways to put Matrix encryption on the phone were considered.

| | A. Native UI + invisible engine | B. `matrix-rust-sdk` UniFFI binding |
| --- | --- | --- |
| Crypto | The same `matrix-js-sdk` + `matrix-sdk-crypto-wasm` path the web client and the end-to-end tests already run (`startSecureClient`, `sendText`, `sendAttachment`). | A second stack. The React Native bindings are still young and are not what the test suite executes. |
| What ships in CI | `expo prebuild` plus the existing Gradle and Xcode jobs. The engine is a local HTML bundle. | A full Rust build of the SDK inside both the Android and unsigned-iOS jobs, plus a new native module. |
| Risk to encryption | None added. The engine refuses to send when the room is not encrypted, exactly as `@imello/core/messaging` does. | A new integration of key storage, cross-signing and backups, with no shared test coverage yet. |

**Choice: A.** It is the path that produces a working APK and unsigned IPA without replacing the tested crypto. Architecture §6 remains the long-term plan for a direct `matrix-rust-sdk` binding. This build does not weaken that plan and does not fork the protocol.

The WebView is not focusable and not tappable, and it never draws a screen. It is a small on-screen view (not 1px) so iOS will start its content process. The engine document is loaded from a `file://` URL with `allowingReadAccessToURL` set to that file's directory. It is not passed through the React Native bridge as a multi-megabyte HTML string, which never finished on a re-signed iPhone. The script is inline, so WebAssembly is instantiated from bytes already in the file (no `file://` fetch, no MIME lookup). The engine repeats `hello` and the last `session` until the host sends `ack`, and the host pings on load. Each startup stage times out after 20 seconds and the app shows a native error with Retry and Copy diagnostics.

## How the pieces talk

```
Native screens (expo-router, NativeTabs)
        │  typed JSON RPC  (src/rpc)
        ▼
Invisible engine (apps/mobile/engine)
        │  matrix-js-sdk + Rust crypto WASM, keys in IndexedDB
        ▼
Synapse Client-Server API
```

The policy API (contacts, family, invites, account) is called with React Native `fetch` through `ImelloApiClient`. That traffic is not subject to browser CORS. Only the Matrix client runs inside the engine, because that is where the WASM and IndexedDB crypto store have to live.

The engine page is bundled into the app (`pnpm --filter @imello/mobile run build:engine`) as one classic `<script>` (an IIFE, not `type="module"`) and opened from the app's own file URL. Inlining that script must not use `String.replace`, because `$&` in the SDK is the replacement pattern for the whole match and was being turned into a literal `<script` tag. `node --check` parses the result as a classic script before CI continues. The bytes of `matrix-sdk-crypto-wasm` are compiled into that file; nothing is loaded from the iMello website. IndexedDB open is bounded by a timeout so a stuck storage call cannot leave the splash up. Keychain is not used on this path, so a re-signed bundle id does not block startup.

### Bridge

`src/rpc/protocol.ts` is the shared envelope (`req` / `res` / `evt`). `RpcClient` correlates ids and times out. Unit tests cover parsing, correlation, the 15s Ping limit, D/R mapping, and the ban on retired brand words in UI copy.

Methods the UI calls: `signIn`, `signOut`, `protect`, `sendText`, `sendPing`, `sendAttachment`, `downloadAttachment`, `retry`, `markRead`, `setTyping`, `openDirect`, `acceptInvite`, `exportKeys`, `importKeys`, `listDevices`, `revokeDevice`, `watch`, `resume`.

The engine pushes `session`, `rooms`, `timeline`, `activity`, and `ping`.

### Keys

Same at-rest model as the web client (`docs/SECURITY.md`):

- The crypto store is IndexedDB, encrypted with a random 32-byte storage key.
- That key and the Matrix session are sealed with a non-extractable WebCrypto AES-GCM key.
- Nothing secret is written to `localStorage` or `AsyncStorage`. Appearance, language and the local status line are the only preferences on disk.
- The access token is handed to the native side in memory so the policy API can send `Authorization`. It is not written to app storage.
- Message text is not written to logs. Notifications omit message text unless the user turns preview on.

Ping is an encrypted `m.room.message` with `im.imello.ping: true`. It uses the same Megolm send path as text. It is limited to one per 15 seconds per chat.

## UI

Classic Blue v0.3.1 is the default (Coral is selectable; mode is Auto / Light / Dark). Screens are React Native: sign-in, chat list, conversation, contacts, Family Space (30-person cap in the UI), settings, appearance, iMello Code, scan, backup, security.

- Tabs use `expo-router` `NativeTabs`. On iOS 26 the system draws the Liquid Glass tab bar; `backgroundColor` and `blurEffect` apply on older iOS. Android uses the Material tab bar. Icons are SF Symbols on iOS and Material symbols on Android.
- Lists are `FlatList` (virtualized). A third-party list native module was not added, so the prebuild stays on Expo modules.
- The composer sits on `react-native-keyboard-controller`.
- New messages and the Ping shake use Reanimated (420ms, ±6px). Reduce Motion skips the shake.
- Sounds in `assets/sounds` are synthesised in `scripts/synth-sounds.mjs` (falling major second for a message, three taps for Ping). They do not play in silent mode.
- Local notifications reuse `expo-notifications` (banner while the JS runtime is alive, badge = unread). Remote push when the process is killed needs APNs/FCM credentials and is not in this build.
- Arabic is RTL (IBM Plex Sans Arabic) and English is LTR (Inter). Western digits in both. The identifier is **iMello Code** / **رمز آي ميلو** (`mell-` plus six digits, the account the API already issues).

## Limits of this build

- Voice and video calls stay on the web client.
- Contact availability lines are not a server field. The signed-in person's status is stored on the device only.
- Read state is ✓ while the event is leaving the device, grey **D** once the server has accepted it, coloured **R** once someone else has a read receipt. That matches the product rule “D = accepted by the server”.
- A killed app does not receive remote pushes.
- The engine's Matrix requests rely on Synapse's client-API CORS, which echoes the request origin. The policy API is not called from the WebView.
