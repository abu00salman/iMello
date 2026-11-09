import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "family-pass-" + randomBytes(4).toString("hex");
const run = randomBytes(3).toString("hex");

async function newPage(browser: Browser, problems: string[]) {
  const page = await (await browser.newContext()).newPage();
  page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  return page;
}

async function register(page: Page, name: string, username: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page.getByRole("navigation", { name: "iMello" })).toBeVisible({ timeout: 60_000 });
}

async function signIn(page: Page, username: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).last().click();
  await expect(page.getByRole("navigation", { name: "iMello" })).toBeVisible({ timeout: 60_000 });
}

test("parent creates a child account; Kids Mode; guardian approves a trusted adult", async ({ browser }) => {
  const problems: string[] = [];
  const parent = await newPage(browser, problems);
  const child = await newPage(browser, problems);
  const aunt = await newPage(browser, problems);

  // 1–3. Parent creates an account, a Family Space and a child account.
  await register(parent, "Dad", `dad.${run}`);
  await parent.getByRole("link", { name: "Settings" }).click();
  await parent.getByRole("link", { name: /Family space/ }).click();
  await parent.getByLabel("Family name").fill("Our Family");
  await parent.getByRole("button", { name: "Create a Family Space" }).click();
  await expect(parent.getByRole("heading", { name: /Our Family/ })).toBeVisible();
  const childForm = parent.locator("form").filter({ hasText: "Add a child account" });
  await childForm.getByLabel("Display name").fill("Lina");
  await childForm.getByLabel("Username").fill(`lina.${run}`);
  await childForm.getByLabel("Password").fill(PASSWORD);
  await childForm.getByRole("button", { name: "Add a child account" }).click();
  await expect(parent.locator(".member-chips").getByText("Lina")).toBeVisible();

  // Child signs in on their own device: Kids Mode with a big card for Dad.
  await signIn(child, `lina.${run}`);
  await expect(child.getByRole("heading", { name: "Hi Lina! 👋" })).toBeVisible();
  await expect(child.getByRole("link", { name: /Add people/ })).toHaveCount(0); // no stranger-facing contact tools
  await child.getByRole("button", { name: "Dad" }).click();
  await expect(child.getByText("End-to-end encrypted")).toBeVisible();
  const hi = `Hi Dad ${randomBytes(3).toString("hex")}`;
  await child.getByLabel("Message", { exact: true }).fill(hi);
  await child.keyboard.press("Enter");

  // Parent accepts and replies.
  await parent.getByRole("link", { name: "Chats" }).click();
  await parent.getByRole("link", { name: /invited you to chat/ }).click();
  await parent.getByRole("button", { name: "Accept chat" }).click();
  await expect(parent.getByTestId("message").filter({ hasText: hi })).toBeVisible();
  const reply = `Hi sweetie ${randomBytes(3).toString("hex")}`;
  await parent.getByLabel("Message", { exact: true }).fill(reply);
  await parent.keyboard.press("Enter");
  await expect(child.getByTestId("message").filter({ hasText: reply })).toBeVisible();

  // 4. A trusted adult's invite reaches the child but needs the guardian's approval.
  await register(aunt, "Aunt Sara", `sara.${run}`);
  await aunt.getByRole("link", { name: "Settings" }).click();
  await aunt.getByRole("link", { name: /Add people/ }).click();
  await aunt.getByRole("button", { name: "Invite someone" }).click();
  const link = await aunt.getByTestId("invite-link").inputValue();
  await child.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await child.getByRole("button", { name: "Continue" }).click();
  await expect(child.getByText("Waiting for guardian approval.").first()).toBeVisible();

  await parent.getByRole("link", { name: "Settings" }).click();
  await parent.getByRole("link", { name: /Family space/ }).click();
  const approval = parent.getByTestId("approval").filter({ hasText: "Aunt Sara wants to connect with Lina" });
  await expect(approval).toBeVisible();
  await approval.getByRole("button", { name: "Approve" }).click();
  await expect(parent.getByText("No pending requests.")).toBeVisible();

  // Aunt can now message the child.
  // The open Contacts screen refreshes on its own (polling/focus); allow for one refresh cycle.
  await aunt.getByRole("button", { name: "Message" }).click({ timeout: 30_000 });
  await expect(aunt.getByText("End-to-end encrypted")).toBeVisible();
  const bday = `Happy birthday Lina ${randomBytes(3).toString("hex")}`;
  await aunt.getByLabel("Message", { exact: true }).fill(bday);
  await aunt.keyboard.press("Enter");
  await child.goto("/#/chats");
  await child.getByRole("link", { name: /Aunt Sara invited you/ }).click();
  await child.getByRole("button", { name: "Accept chat" }).click();
  await expect(child.getByTestId("message").filter({ hasText: bday })).toBeVisible();

  expect(problems).toEqual([]);
});
