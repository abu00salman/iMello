/** BBM-style redesign screenshots. Opt-in: BBM_SHOTS=<output dir>. Real accounts, real encrypted messages. */
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const dir = process.env.BBM_SHOTS;
test.skip(!dir, "set BBM_SHOTS=<dir>");
const PASSWORD = "bbm-pass-" + randomBytes(4).toString("hex");
const run = randomBytes(3).toString("hex");
const shot = (p: Page, n: string) => p.screenshot({ path: `${dir}/${n}.png` });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAADVYtl6AAAAQklEQVR42u3OMQ0AAAgDoL9/6c3hDElo6Jw5fCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIPAfWnXBA4l2cH6HAAAAAElFTkSuQmCC", "base64");

async function register(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Username").fill(`${name.toLowerCase()}.${run}`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page.getByRole("navigation", { name: "iMello" })).toBeVisible({ timeout: 60_000 });
}
async function theme(p: Page, name: string, back: string) {
  await p.getByRole("link", { name: back === "Chats" ? "Settings" : "الإعدادات" }).click();
  await p.getByRole("radio", { name }).click();
  await p.getByRole("link", { name: back }).click();
}

test("bbm screens", async ({ browser }) => {
  test.setTimeout(240_000);
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true };
  const a = await (await browser.newContext(phone)).newPage();
  const b = await (await browser.newContext(phone)).newPage();
  await a.goto("/");
  await shot(a, "01-sign-in");
  await register(a, "Mona");
  await register(b, "Omar");
  await a.getByRole("link", { name: "Contacts" }).click();
  await a.getByRole("button", { name: "Invite someone" }).click();
  const link = await a.getByTestId("invite-link").inputValue();
  await b.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await b.getByRole("button", { name: "Continue" }).click();
  await b.getByRole("button", { name: "Message" }).click();
  await a.getByRole("link", { name: "Chats" }).click();
  await a.getByRole("link", { name: /invited you/ }).click();
  await a.getByRole("button", { name: "Accept chat" }).click();
  for (const [p, text] of [
    [b, "Hi Mona! Are we still on for Friday dinner? 🍲"],
    [a, "Yes! The kids are excited. 7pm at grandma's?"],
    [b, "Perfect. I'll bring dessert 🎂"],
  ] as const) {
    await p.getByLabel("Message", { exact: true }).fill(text);
    await p.keyboard.press("Enter");
    await expect((p === a ? b : a).getByTestId("message").filter({ hasText: text })).toBeVisible();
  }
  // a photo
  await a.getByTestId("file-input").setInputFiles({ name: "dinner.png", mimeType: "image/png", buffer: PNG });
  await expect(b.getByTestId("attachment-image").last()).toBeVisible({ timeout: 30_000 });
  await a.waitForTimeout(1500);
  await shot(a, "02-conversation");
  await a.getByRole("button", { name: "Emoji" }).click();
  await shot(a, "03-emoji-picker");
  await a.getByRole("button", { name: "😍" }).click();
  await a.getByRole("button", { name: "Emoji" }).click();
  await a.getByRole("button", { name: "Back" }).first().click();
  await shot(a, "04-chat-list");
  await b.getByLabel("Message", { exact: true }).fill("See you then!");
  await b.keyboard.press("Enter");
  await a.waitForTimeout(1500);
  await shot(a, "05-chat-list-unread");
  await a.getByRole("link", { name: "Contacts" }).click();
  await shot(a, "06-contacts");
  await a.getByRole("link", { name: "Settings" }).click();
  await shot(a, "07-settings");
  await theme(a, "Dark", "Chats");
  await shot(a, "08-chat-list-dark");
  await a.getByRole("link", { name: /Omar/ }).first().click();
  await a.waitForTimeout(800);
  await shot(a, "09-conversation-dark");
  await theme(a, "Light", "Chats");
  await a.getByRole("link", { name: /Omar/ }).first().click();
  await a.waitForTimeout(800);
  await shot(a, "10-conversation-light");
  await theme(a, "Classic Blue", "Chats");
  await a.getByRole("link", { name: "Settings" }).click();
  await a.getByRole("radio", { name: "العربية" }).click();
  await a.getByRole("link", { name: "المحادثات" }).click();
  await shot(a, "11-chat-list-arabic");
  await a.getByRole("link", { name: /Omar/ }).first().click();
  await a.waitForTimeout(800);
  await shot(a, "12-conversation-arabic");
  await a.getByRole("button", { name: "الوجوه التعبيرية" }).click();
  await shot(a, "13-emoji-arabic");
  const d = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await d.goto("/");
  await register(d, "Sara");
  await shot(d, "14-desktop");
});
