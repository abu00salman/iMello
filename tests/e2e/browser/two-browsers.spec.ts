import { randomBytes } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = "browser-pass-" + randomBytes(4).toString("hex");
const run = randomBytes(3).toString("hex");

function watchForProblems(page: Page, problems: string[]) {
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Content Security Policy|Refused to/i.test(text)) problems.push(`CSP: ${text}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
}

async function registerViaUi(context: BrowserContext, name: string, problems: string[]) {
  const page = await context.newPage();
  watchForProblems(page, problems);
  await page.goto("/");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Username").fill(`${name.toLowerCase()}.${run}`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page.getByRole("navigation", { name: "Wanas" })).toBeVisible({ timeout: 60_000 });
  return page;
}

test("two independent browser sessions exchange end-to-end encrypted messages", async ({ browser }) => {
  const problems: string[] = [];
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const alice = await registerViaUi(ctxA, "Alice", problems);
  const bob = await registerViaUi(ctxB, "Bob", problems);

  // Alice creates a private invite link.
  await alice.getByRole("link", { name: "Settings" }).click();
  await alice.getByRole("link", { name: /Add people/ }).click();
  await alice.getByRole("button", { name: "Invite someone" }).click();
  const link = await alice.getByTestId("invite-link").inputValue();
  expect(link).toMatch(/#\/i\/[A-Za-z0-9_-]{43}$/);

  // Bob opens the link and accepts it.
  await bob.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(bob.getByTestId("redeem-input")).toHaveValue(/[A-Za-z0-9_-]{43}/);
  await expect(bob.getByText("Alice", { exact: true })).toBeVisible(); // invite preview
  await bob.getByRole("button", { name: "Continue" }).click();
  await expect(bob.getByRole("status").filter({ hasText: "Contact added." })).toBeVisible();

  // Bob starts an encrypted chat with Alice.
  await bob.getByRole("button", { name: "Message" }).click();
  await expect(bob.getByText("End-to-end encrypted")).toBeVisible();

  // Alice accepts.
  await alice.getByRole("link", { name: "Chats" }).click();
  await alice.getByRole("link", { name: /invited you to chat/ }).click();
  await alice.getByRole("button", { name: "Accept chat" }).click();
  await expect(alice.getByText("End-to-end encrypted")).toBeVisible();

  // Bob → Alice
  const hello = `Hello Alice ${randomBytes(4).toString("hex")}`;
  await bob.getByLabel("Message", { exact: true }).fill(hello);
  await bob.keyboard.press("Enter");
  await expect(alice.getByTestId("message").filter({ hasText: hello })).toBeVisible();

  // Alice → Bob, in Arabic.
  const reply = `أهلًا بوب ${randomBytes(4).toString("hex")}`;
  await alice.getByLabel("Message", { exact: true }).fill(reply);
  await alice.getByRole("button", { name: "Send" }).click();
  await expect(bob.getByTestId("message").filter({ hasText: reply })).toBeVisible();

  // Delivery state is shown for own messages: D (sent) turns into R once Alice has read it.
  await expect(bob.getByTestId("message").filter({ hasText: hello }).getByLabel(/^(Sent|Read)$/)).toBeVisible();

  // Switching Alice to Arabic flips the whole interface to RTL.
  await alice.getByRole("link", { name: "Settings" }).click();
  await alice.getByRole("radio", { name: "العربية" }).click();
  await expect(alice.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(alice.locator("html")).toHaveAttribute("lang", "ar");
  await expect(alice.getByRole("link", { name: "المحادثات" })).toBeVisible();
  await alice.getByRole("link", { name: "المحادثات" }).click();
  await alice.getByRole("link", { name: /Bob/ }).first().click();
  await expect(alice.getByText("مشفّرة من طرف إلى طرف")).toBeVisible();
  await expect(alice.getByLabel("رسالة", { exact: true })).toBeVisible();

  // Reloading restores the session from encrypted IndexedDB and can still decrypt history.
  await bob.reload();
  await expect(bob.getByRole("navigation", { name: "Wanas" })).toBeVisible({ timeout: 60_000 });
  await bob.getByRole("link", { name: /Alice/ }).first().click();
  await expect(bob.getByTestId("message").filter({ hasText: reply })).toBeVisible();

  // No secret material in localStorage/sessionStorage.
  for (const page of [alice, bob]) {
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(storage).not.toMatch(/syt_|access_token|accessToken/);
  }

  expect(problems).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});

test("temporary session keeps nothing after sign-out", async ({ browser }) => {
  const problems: string[] = [];
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  watchForProblems(page, problems);
  await page.goto("/");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill("Kiosk");
  await page.getByLabel("Username").fill(`kiosk.${run}`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel(/temporary session/).check();
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page.getByText("Public or shared computer (temporary session)").first()).toBeVisible({ timeout: 60_000 });

  // Nothing persisted: a reload returns to the sign-in screen.
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(dbs.filter((n) => n?.startsWith("imello-crypto"))).toEqual([]);
  expect(problems).toEqual([]);
  await ctx.close();
});
