// Render PNG app icons from public/icon.svg using the preinstalled Chromium (Playwright).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(join(root, "public/icon.svg"), "utf8");
const targets = [
  ["public/icons/icon-180.png", 180, false],
  ["public/icons/icon-192.png", 192, false],
  ["public/icons/icon-512.png", 512, false],
  ["public/icons/icon-maskable-512.png", 512, true],
  ["../mobile/assets/icon.png", 1024, true],
  ["../mobile/assets/adaptive-icon.png", 1024, true],
  ["../mobile/assets/splash-icon.png", 512, false],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [out, size, fullBleed] of targets) {
  // Maskable/OS-masked icons must be full-bleed squares: drop the rounded corners.
  const art = fullBleed ? svg.replaceAll('rx="116"', 'rx="0"') : svg;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${art.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  const buf = await page.locator("svg").screenshot({ omitBackground: true });
  await mkdir(dirname(join(root, out)), { recursive: true });
  await writeFile(join(root, out), buf);
  console.log("wrote", out);
}
await browser.close();
