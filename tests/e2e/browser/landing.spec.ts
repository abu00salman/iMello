/**
 * The GitHub Pages layout: landing page at /iMello/, the app at /iMello/app/, the service worker at /iMello/sw.js.
 * Builds the real site with scripts/assemble-pages.sh and serves it under the same path prefix.
 */
import { execSync } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".wasm": "application/wasm", ".json": "application/json", ".webmanifest": "application/manifest+json", ".mp4": "video/mp4", ".webm": "video/webm" };
let server: Server;
let origin = "";

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const out = join(mkdtempSync(join(tmpdir(), "imello-site-")), "site");
  execSync(`bash scripts/assemble-pages.sh /iMello/ "${out}"`, { cwd: "../..", stdio: "pipe", env: { ...process.env, VITE_API_URL: "http://localhost:8787", VITE_HOMESERVER_URL: "http://localhost:8008" } });
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (!url.pathname.startsWith("/iMello/")) { res.writeHead(404).end(); return; }
    let file = normalize(join(out, decodeURIComponent(url.pathname.slice("/iMello/".length))));
    if (!file.startsWith(out)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  // 5173 is one of the origins the local API allows (CORS), like the dev server would be.
  await new Promise<void>((r) => server.listen(5173, r));
  origin = "http://localhost:5173";
});
test.afterAll(() => server?.close());

test("landing page: Arabic by default, live card, language switch, no CSP violations", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(`${origin}/iMello/`);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("خلّك قريب");
  const number = page.locator("#num");
  await expect(number).toHaveText(/^\d{4}$/);
  const first = await number.textContent();
  for (let i = 0; i < 5 && (await number.textContent()) === first; i++) await page.locator("#again").click();
  expect(await number.textContent()).not.toBe(first);
  await page.locator("#nm").fill("أبو سلمان");
  await expect(page.locator("#cardname")).toHaveText("أبو سلمان");
  await page.locator("#lang").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Stay close.");
  expect(await page.evaluate(() => localStorage.getItem("imello.locale"))).toBe("en");
  expect(problems).toEqual([]);
});

test("existing links keep working: invite link, native app and returning users go straight to the app", async ({ browser }) => {
  // 1) an invite link shared before the landing page existed
  const a = await (await browser.newContext()).newPage();
  await a.goto(`${origin}/iMello/#/i/sometoken123`);
  await expect(a).toHaveURL(`${origin}/iMello/app/#/i/sometoken123`);
  // 2) the native Wanas app (WebView user agent marker) opening the site root
  const b = await (await browser.newContext({ userAgent: "Mozilla/5.0 iMelloApp/1.0" })).newPage();
  await b.goto(`${origin}/iMello/`);
  await expect(b).toHaveURL(/\/iMello\/app\/$/);
  // 3) someone who already used the app in this browser; ?landing still shows the landing page
  const c = await (await browser.newContext()).newPage();
  await c.addInitScript(() => localStorage.setItem("imello.returning", "1"));
  await c.goto(`${origin}/iMello/`);
  await expect(c).toHaveURL(/\/iMello\/app\/$/);
  await c.goto(`${origin}/iMello/?landing`);
  await expect(c.getByRole("heading", { level: 1 })).toBeVisible();
  expect(c.url()).toContain("?landing");
});

test("the app works under /iMello/app/: name handed over from the landing page, service worker keeps the site-root scope, returning marker set", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  const page = await ctx.newPage();
  await page.goto(`${origin}/iMello/`);
  await page.locator("#cta-name").fill("نورة");
  await page.getByRole("button", { name: "أبدأ" }).click();
  await expect(page).toHaveURL(/\/iMello\/app\/$/);
  await expect(page.getByLabel("اسمك (اختياري)")).toHaveValue("نورة");
  await page.getByRole("button", { name: "ابدأ الآن" }).click();
  await expect(page.getByRole("navigation", { name: "Wanas" })).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => localStorage.getItem("imello.returning"))).toBe("1");
  expect(await page.evaluate(() => localStorage.getItem("imello.prefillName"))).toBeNull();
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope ?? null);
  expect(scope).toBe(`${origin}/iMello/`);
});
