import { expect, test, type Browser } from "@playwright/test";

async function startNow(browser: Browser, name: string) {
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByLabel("Your name (optional)").fill(name);
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page.getByRole("navigation", { name: "iMello" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Settings" }).click();
  const pin = (await page.getByTestId("my-pin").textContent())!.trim();
  return { page, pin };
}

test("1:1 voice call: ring → answer → connected → hang up", async ({ browser }) => {
  const a = await startNow(browser, "Huda");
  const b = await startNow(browser, "Majed");
  await a.page.getByRole("link", { name: "Contacts" }).click();
  await a.page.getByTestId("pin-input").fill(b.pin.replace("mell-", ""));
  await a.page.getByRole("button", { name: "Add", exact: true }).click();
  await b.page.getByRole("link", { name: "Contacts" }).click();
  await b.page.getByTestId("incoming-request").getByRole("button", { name: "Accept" }).click({ timeout: 30_000 });
  await b.page.getByRole("button", { name: "Message" }).click();
  await b.page.getByLabel("Message", { exact: true }).fill("hi");
  await b.page.keyboard.press("Enter");
  await a.page.getByRole("link", { name: "Chats" }).click();
  await a.page.getByRole("link", { name: /invited you to chat/ }).click();
  await a.page.getByRole("button", { name: "Accept chat" }).click();
  await expect(a.page.getByTestId("message").filter({ hasText: "hi" })).toBeVisible();

  await a.page.getByRole("button", { name: "Voice call" }).click();
  await expect(b.page.getByTestId("call-overlay")).toBeVisible({ timeout: 30_000 });
  await b.page.getByRole("button", { name: "Answer" }).click();
  await expect(a.page.getByTestId("call-status")).toHaveText(/^\d+:\d\d$/, { timeout: 30_000 });
  await expect(b.page.getByTestId("call-status")).toHaveText(/^\d+:\d\d$/, { timeout: 30_000 });
  await a.page.getByRole("button", { name: "Hang up" }).click();
  await expect(b.page.getByTestId("call-overlay")).toBeHidden({ timeout: 15_000 });
});
