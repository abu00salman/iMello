import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";

async function startNow(browser: Browser, name: string, problems: string[]) {
  const page = await (await browser.newContext()).newPage();
  page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto("/");
  await page.getByLabel("Your name (optional)").fill(name);
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page.getByRole("navigation", { name: "Wanas" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Settings" }).click();
  const pin = (await page.getByTestId("my-pin").textContent())!.trim();
  expect(pin).toMatch(/^w\d{4}$/);
  return { page, pin };
}

async function openChatWith(page: Page, name: string) {
  await page.getByRole("link", { name: "Chats" }).click();
  await page.getByRole("link", { name: new RegExp(name) }).first().click();
}

test("Start now → add by number → accept → encrypted chat → protect account → sign in with number", async ({ browser }) => {
  const problems: string[] = [];
  const noor = await startNow(browser, "Noor", problems);
  const fahad = await startNow(browser, "Fahad", problems);

  // Unprotected accounts are reminded to set a password.
  await noor.page.getByRole("link", { name: "Chats" }).click();
  await expect(noor.page.getByRole("link", { name: /Protect your account/ })).toBeVisible();

  // Noor adds Fahad by number.
  await noor.page.getByRole("link", { name: "Settings" }).click();
  await noor.page.getByRole("link", { name: /Add people/ }).click();
  await noor.page.getByTestId("pin-input").fill(fahad.pin.replace(/^(w|mell-)/i, ""));
  await noor.page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(noor.page.getByText("Request sent.")).toBeVisible();

  // Fahad sees the request and accepts.
  await fahad.page.getByRole("link", { name: "Settings" }).click();
  await fahad.page.getByRole("link", { name: /Add people/ }).click();
  const request = fahad.page.getByTestId("incoming-request").filter({ hasText: "Noor wants to add you" });
  await expect(request).toBeVisible({ timeout: 30_000 });
  await expect(request).toContainText(noor.pin);
  await request.getByRole("button", { name: "Accept" }).click();
  await expect(fahad.page.getByText("Contact added.")).toBeVisible();

  // Fahad messages Noor.
  await fahad.page.getByRole("button", { name: "Message" }).click();
  await expect(fahad.page.getByText("End-to-end encrypted")).toBeVisible();
  const hello = `Salam Noor ${randomBytes(3).toString("hex")}`;
  await fahad.page.getByLabel("Message", { exact: true }).fill(hello);
  await fahad.page.keyboard.press("Enter");
  await noor.page.getByRole("link", { name: "Chats" }).click();
  await noor.page.getByRole("link", { name: /invited you to chat/ }).click();
  await noor.page.getByRole("button", { name: "Accept chat" }).click();
  await expect(noor.page.getByTestId("message").filter({ hasText: hello })).toBeVisible();

  // Fahad protects his account, signs out, and signs back in with number + password.
  const password = "fahad-pass-" + randomBytes(3).toString("hex");
  await fahad.page.getByRole("link", { name: "Settings" }).click();
  const protectForm = fahad.page.locator(".protect-card");
  await protectForm.getByLabel("New password").fill(password);
  await protectForm.getByLabel("Confirm password").fill(password);
  await fahad.page.getByRole("button", { name: "Protect your account" }).click();
  await expect(fahad.page.getByText("Your account is protected.")).toBeVisible();
  await fahad.page.getByRole("button", { name: "Sign out", exact: true }).click();
  await fahad.page.getByRole("button", { name: "Sign in" }).click();
  await fahad.page.getByLabel("Wanas Code or username").fill(fahad.pin.toUpperCase());
  await fahad.page.getByLabel("Password").fill(password);
  await fahad.page.getByRole("button", { name: "Sign in" }).last().click();
  await expect(fahad.page.getByRole("navigation", { name: "Wanas" })).toBeVisible({ timeout: 60_000 });
  await openChatWith(fahad.page, "Noor");
  await expect(fahad.page.getByText("End-to-end encrypted")).toBeVisible();

  expect(problems).toEqual([]);
});
