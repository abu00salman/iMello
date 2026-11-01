/**
 * Captures documentation screenshots (docs/screenshots). Opt-in: SCREENSHOTS=1.
 * Uses real accounts and real encrypted messages — nothing is mocked.
 */
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture screenshots");

const PASSWORD = "shots-pass-" + randomBytes(4).toString("hex");
const run = randomBytes(3).toString("hex");
const out = (name: string) => `../../docs/screenshots/${name}.png`;

async function register(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Username").fill(`${name.toLowerCase().replace(/\s/g, "")}.${run}`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page.getByRole("navigation", { name: "iMello" })).toBeVisible({ timeout: 60_000 });
}

test("capture", async ({ browser }) => {
  const a = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const b = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" })).newPage();

  await a.goto("/");
  await a.screenshot({ path: out("sign-in") });
  await register(a, "Mona");
  await register(b, "Omar");

  await a.getByRole("link", { name: "Contacts" }).click();
  await a.getByRole("button", { name: "Invite someone" }).click();
  const link = await a.getByTestId("invite-link").inputValue();
  await a.screenshot({ path: out("contacts-invite") });

  await b.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await b.getByRole("button", { name: "Continue" }).click();
  await b.getByRole("button", { name: "Message" }).click();
  await a.getByRole("link", { name: "Chats" }).click();
  await a.getByRole("link", { name: /invited you/ }).click();
  await a.getByRole("button", { name: "Accept chat" }).click();

  for (const [page, text] of [
    [b, "Hi Mona! Are we still on for Friday dinner? 🍲"],
    [a, "Yes! The kids are excited. 7pm at grandma's?"],
    [b, "Perfect. I'll bring dessert."],
    [a, "تمام، نشوفكم الجمعة ❤️"],
  ] as const) {
    await page.getByLabel("Message", { exact: true }).fill(text);
    await page.keyboard.press("Enter");
    await expect((page === a ? b : a).getByTestId("message").filter({ hasText: text })).toBeVisible();
  }
  await a.screenshot({ path: out("chat-desktop-light") });
  await b.screenshot({ path: out("chat-mobile-dark") });

  await a.getByRole("link", { name: "Settings" }).click();
  await a.getByRole("radio", { name: "العربية" }).click();
  await a.getByRole("link", { name: "المحادثات" }).click();
  await a.getByRole("link", { name: /Omar/ }).first().click();
  await expect(a.getByTestId("message").first()).toBeVisible();
  await a.screenshot({ path: out("chat-desktop-arabic-rtl") });

  await a.getByRole("link", { name: "العائلة" }).click();
  await a.getByLabel("اسم العائلة").fill("عائلة منى");
  await a.getByRole("button", { name: "أنشئ مساحة عائلية" }).click();
  await expect(a.getByText("عائلة منى")).toBeVisible();
  await a.screenshot({ path: out("family-arabic"), fullPage: true });
});
