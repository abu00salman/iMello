import { expect, test, type Browser } from "@playwright/test";

async function startNow(browser: Browser, name: string) {
  const ctx = await browser.newContext({ permissions: ["microphone", "camera"], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByLabel("Your name (optional)").fill(name);
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page.getByRole("navigation", { name: "iMello" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Settings" }).click();
  const pin = (await page.getByTestId("my-pin").textContent())!.trim();
  return { page, pin };
}

async function pair(browser: Browser) {
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
  return { a, b };
}

test("1:1 voice call: ring → answer → connected → hang up", async ({ browser }) => {
  const { a, b } = await pair(browser);
  await a.page.getByRole("button", { name: "Voice call" }).click();
  await expect(b.page.getByTestId("call-overlay")).toBeVisible({ timeout: 30_000 });
  await b.page.getByRole("button", { name: "Answer" }).click();
  await expect(a.page.getByTestId("call-status")).toHaveText(/^\d+:\d\d$/, { timeout: 30_000 });
  await expect(b.page.getByTestId("call-status")).toHaveText(/^\d+:\d\d$/, { timeout: 30_000 });
  await a.page.getByRole("button", { name: "Hang up" }).click();
  await expect(b.page.getByTestId("call-overlay")).toBeHidden({ timeout: 15_000 });
});

test("1:1 video call: both sides see each other's camera, camera toggle, hang up", async ({ browser }) => {
  const { a, b } = await pair(browser);
  await a.page.getByRole("button", { name: "Video call" }).click();
  await expect(b.page.getByTestId("call-overlay")).toBeVisible({ timeout: 30_000 });
  await expect(b.page.getByTestId("call-status")).toHaveText("Incoming video call…");
  await b.page.getByRole("button", { name: "Answer with video" }).click();
  await expect(a.page.getByTestId("call-status")).toHaveText(/^\d+:\d\d$/, { timeout: 30_000 });
  // Real frames are flowing from the other side's (fake) camera.
  for (const p of [a.page, b.page]) {
    await expect
      .poll(() => p.getByTestId("remote-video").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 })
      .toBeGreaterThan(0);
  }
  await b.page.waitForTimeout(800);
  await b.page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/video-call.png` : "test-results/video-call.png" });
  await a.page.getByRole("button", { name: "Turn camera off" }).click();
  await expect(a.page.getByRole("button", { name: "Turn camera on" })).toHaveAttribute("aria-pressed", "true");
  await a.page.getByRole("button", { name: "Hang up" }).click();
  await expect(b.page.getByTestId("call-overlay")).toBeHidden({ timeout: 15_000 });
});
