import { randomBytes } from "node:crypto";
import { expect, test, type Browser } from "@playwright/test";

// 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function startNow(browser: Browser, name: string, problems: string[]) {
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto("/");
  await page.getByLabel("Your name (optional)").fill(name);
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page.getByRole("navigation", { name: "iMello" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Settings" }).click();
  const pin = (await page.getByTestId("my-pin").textContent())!.trim();
  return { page, pin };
}

test("photos, documents and voice messages are sent encrypted and shown in the chat", async ({ browser }) => {
  const problems: string[] = [];
  const sara = await startNow(browser, "Sara", problems);
  const ali = await startNow(browser, "Ali", problems);

  // Connect by number and open a chat.
  await sara.page.getByRole("link", { name: "Contacts" }).click();
  await sara.page.getByTestId("pin-input").fill(ali.pin);
  await sara.page.getByRole("button", { name: "Add", exact: true }).click();
  await ali.page.getByRole("link", { name: "Contacts" }).click();
  await ali.page.getByTestId("incoming-request").getByRole("button", { name: "Accept" }).click({ timeout: 30_000 });
  await ali.page.getByRole("button", { name: "Message" }).click();
  await expect(ali.page.getByText("End-to-end encrypted")).toBeVisible();
  await sara.page.getByRole("link", { name: "Chats" }).click();
  await sara.page.getByRole("link", { name: /invited you to chat/ }).click();
  await sara.page.getByRole("button", { name: "Accept chat" }).click();
  await expect(sara.page.getByText("End-to-end encrypted")).toBeVisible();

  // Photo
  await ali.page.getByTestId("file-input").setInputFiles({ name: "beach.png", mimeType: "image/png", buffer: PNG });
  const img = sara.page.getByTestId("attachment-image");
  await expect(img).toBeVisible({ timeout: 30_000 });
  expect(await img.getAttribute("src")).toMatch(/^blob:/);

  // Document
  const docText = `Trip plan ${randomBytes(4).toString("hex")}`;
  await ali.page.getByTestId("file-input").setInputFiles({ name: "trip-plan.pdf", mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4 ${docText}`) });
  const fileRow = sara.page.getByTestId("attachment-file").filter({ hasText: "trip-plan.pdf" });
  await expect(fileRow).toBeVisible({ timeout: 30_000 });
  const download = sara.page.waitForEvent("download");
  await fileRow.getByRole("button", { name: "Download" }).click();
  const saved = await (await download).path();
  expect((await import("node:fs")).readFileSync(saved!, "utf8")).toContain(docText);

  // Voice message (fake microphone): tap to record, tap to send.
  await sara.page.getByRole("button", { name: "Record a voice message" }).click();
  await expect(sara.page.getByText("Recording…")).toBeVisible();
  await sara.page.waitForTimeout(1500);
  await sara.page.getByRole("button", { name: "Send voice message" }).click();
  const voice = ali.page.getByTestId("attachment-voice");
  await expect(voice).toBeVisible({ timeout: 30_000 });
  await expect(voice.getByRole("button", { name: "Play", exact: true })).toBeVisible({ timeout: 30_000 });

  // Conversation list previews the latest attachment.
  await ali.page.getByRole("link", { name: "Chats" }).click();
  await expect(ali.page.getByText("🎤 Voice message")).toBeVisible();

  expect(problems).toEqual([]);
});
