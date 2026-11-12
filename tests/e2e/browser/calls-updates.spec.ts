/** The Calls and Updates tabs, between two independent users (real accounts, encrypted rooms). */
import { randomBytes } from "node:crypto";
import { expect, test, type Browser } from "@playwright/test";

async function startNow(browser: Browser, name: string) {
  const ctx = await browser.newContext({ permissions: ["microphone", "camera"] });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByLabel("Your name (optional)").fill(name);
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page.getByRole("navigation", { name: "Wanas" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Settings" }).click();
  const pin = (await page.getByTestId("my-pin").textContent())!.trim();
  return { page, pin };
}

test("updates reach contacts; a missed call shows in Calls for both people", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await startNow(browser, "Reem");
  const b = await startNow(browser, "Saud");
  await a.page.getByRole("link", { name: /Add people/ }).click();
  await a.page.getByTestId("pin-input").fill(b.pin);
  await a.page.getByRole("button", { name: "Add", exact: true }).click();
  await b.page.getByRole("link", { name: /Add people/ }).click();
  await b.page.getByTestId("incoming-request").getByRole("button", { name: "Accept" }).click({ timeout: 30_000 });
  await b.page.getByRole("button", { name: "Message" }).click();
  await expect(b.page.getByText("End-to-end encrypted")).toBeVisible();
  await b.page.getByLabel("Message", { exact: true }).fill("hi");
  await b.page.keyboard.press("Enter");
  await a.page.getByRole("link", { name: "Back" }).click();
  await a.page.getByRole("link", { name: "Chats" }).click();
  await a.page.getByRole("link", { name: /invited you to chat/ }).click();
  await a.page.getByRole("button", { name: "Accept chat" }).click();
  await expect(a.page.getByTestId("message").filter({ hasText: "hi" })).toBeVisible({ timeout: 30_000 });

  // Saud posts an update; Reem sees it in Updates without accepting anything, and it is not a chat.
  const update = `At the beach today ${randomBytes(3).toString("hex")}`;
  await b.page.getByRole("link", { name: "Updates" }).click();
  await b.page.getByLabel("Share an update with your contacts…").fill(update);
  await b.page.getByRole("button", { name: "Post" }).click();
  await expect(b.page.getByTestId("update-list")).toContainText(update, { timeout: 20_000 });
  await a.page.getByRole("link", { name: "Updates" }).click();
  await expect(a.page.getByTestId("update-list")).toContainText(update, { timeout: 40_000 });
  await a.page.getByRole("link", { name: "Chats" }).click();
  await expect(a.page.locator(".conv-name").filter({ hasText: "status" })).toHaveCount(0);

  // Reem calls Saud, who doesn't answer; she hangs up. Both see it in Calls.
  await a.page.getByRole("link", { name: /Saud/ }).first().click();
  await a.page.getByRole("button", { name: "Voice call" }).click();
  await expect(b.page.getByRole("button", { name: /Decline/ })).toBeVisible({ timeout: 30_000 });
  await b.page.getByRole("button", { name: /Decline/ }).click();
  await a.page.waitForTimeout(2000);
  await a.page.getByRole("link", { name: "Calls" }).click();
  await expect(a.page.getByTestId("call-list")).toContainText("Saud");
  await expect(a.page.getByTestId("call-list")).toContainText("Outgoing");
  await b.page.getByRole("link", { name: "Calls" }).click();
  await expect(b.page.getByTestId("call-list")).toContainText("Reem", { timeout: 20_000 });
  await expect(b.page.getByTestId("call-list")).toContainText("Missed");
});
