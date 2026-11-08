/**
 * Photographs the offline Classic Blue fixture with react-native-web.
 * This is the same FixtureView the simulator opens at imello://preview.
 * It does not sign in and does not load the crypto engine.
 *
 *   node scripts/screenshot-fixture.mjs /tmp/imello-shots
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(process.argv[2] ?? "/tmp/imello-shots");
mkdirSync(outDir, { recursive: true });

writeFileSync(
  path.join(outDir, "safe-area-shim.js"),
  `import { createContext, useContext, createElement } from "react";
import { View } from "react-native";
const insets = { top: 54, bottom: 34, left: 0, right: 0 };
const Ctx = createContext(insets);
export function SafeAreaProvider({ children }) { return children; }
export function useSafeAreaInsets() { return useContext(Ctx); }
export function SafeAreaView({ children, style }) {
  return createElement(View, { style: [{ paddingTop: insets.top, paddingBottom: insets.bottom }, style] }, children);
}
`,
);

writeFileSync(
  path.join(outDir, "entry.tsx"),
  `import { AppRegistry } from "react-native";
import { FixtureView } from ${JSON.stringify(path.join(root, "src/ui/fixture.tsx"))};
const params = new URLSearchParams(location.search);
const screen = (params.get("screen") || "chats") as "chats" | "chat" | "ping" | "signin";
const locale = params.get("lang") === "en" ? "en" : "ar";
function App() { return <FixtureView locale={locale} screen={screen} />; }
AppRegistry.registerComponent("main", () => App);
AppRegistry.runApplication("main", { rootTag: document.getElementById("root") });
`,
);

await new Promise((resolve, reject) => {
  const child = spawn(
    path.join(root, "node_modules/.bin/esbuild"),
    [
      path.join(outDir, "entry.tsx"),
      `--outfile=${path.join(outDir, "fixture.js")}`,
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      `--alias:react-native=react-native-web`,
      `--alias:react-native-safe-area-context=${path.join(outDir, "safe-area-shim.js")}`,
      "--define:process.env.NODE_ENV=\"development\"",
      "--define:__DEV__=true",
      "--loader:.ttf=empty",
    ],
    { cwd: root, stdio: "inherit" },
  );
  child.on("exit", (code) => (code === 0 ? resolve(undefined) : reject(new Error(`esbuild exited ${code}`))));
});

const html = `<!doctype html>
<html lang="ar">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @font-face { font-family: "Plex"; src: url("/font/IBMPlexSansArabic-Regular.ttf"); }
  @font-face { font-family: "Plex-Medium"; src: url("/font/IBMPlexSansArabic-Medium.ttf"); }
  @font-face { font-family: "Plex-SemiBold"; src: url("/font/IBMPlexSansArabic-SemiBold.ttf"); }
  @font-face { font-family: "Plex-Bold"; src: url("/font/IBMPlexSansArabic-Bold.ttf"); }
  @font-face { font-family: "Inter"; src: url("/font/Inter-Regular.ttf"); }
  @font-face { font-family: "Inter-Medium"; src: url("/font/Inter-Medium.ttf"); }
  @font-face { font-family: "Inter-SemiBold"; src: url("/font/Inter-SemiBold.ttf"); }
  @font-face { font-family: "Inter-Bold"; src: url("/font/Inter-Bold.ttf"); }
  html, body, #root { height: 100%; margin: 0; }
  body { background: #fff; }
</style>
</head>
<body><div id="root"></div><script src="/fixture.js"></script></body>
</html>`;

const fonts = path.join(root, "assets/fonts");
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/fixture.js") {
    res.setHeader("content-type", "text/javascript");
    res.end(readFileSync(path.join(outDir, "fixture.js")));
    return;
  }
  if (url.pathname.startsWith("/font/")) {
    res.setHeader("content-type", "font/ttf");
    res.end(readFileSync(path.join(fonts, path.basename(url.pathname))));
    return;
  }
  res.setHeader("content-type", "text/html");
  res.end(html);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = /** @type {{ port: number }} */ (server.address());

function shot(screen) {
  const file = path.join(outDir, `ar-${screen}.png`);
  const url = `http://127.0.0.1:${port}/preview?lang=ar&screen=${screen}`;
  return capture(url, file);
}

async function capture(url, file) {
  const debugPort = 9333;
  const chrome = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${debugPort}`,
      "--user-data-dir=/tmp/cr-fixture",
      "--window-size=390,844",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  try {
    let wsUrl = "";
    for (let i = 0; i < 40; i++) {
      try {
        const list = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) => r.json());
        wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
        if (wsUrl) break;
      } catch {
        /* debugger not up yet */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!wsUrl) throw new Error("chrome debugger did not start");
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });
    let seq = 0;
    const pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg.result);
    });
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = ++seq;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 800));
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    ws.close();
    return file;
  } finally {
    chrome.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 300));
  }
}

for (const screen of ["chats", "chat", "ping", "signin"]) {
  console.log(await shot(screen));
}
server.close();
