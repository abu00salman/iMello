import { expect, test } from "@playwright/test";

const API = /\/v1\/(me|config)(\?|$)/;

test("server outage: saved session stays on the waiting screen (never the sign-up screen) and recovers by itself", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page.getByRole("navigation", { name: "iMello" })).toBeVisible({ timeout: 60_000 });

  // The API stops answering (as when the host computer sleeps).
  let down = true;
  await page.route(API, (route) => (down ? route.abort("connectionrefused") : route.continue()));
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Loading" })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(6000);
  // Still waiting: the sign-up screen (where "Start now" could replace the saved account) never appears.
  await expect(page.getByRole("button", { name: "Start now" })).toHaveCount(0);

  // Server returns → the app opens on its own.
  down = false;
  await expect(page.getByRole("navigation", { name: "iMello" })).toBeVisible({ timeout: 60_000 });
});

test("sign-in screen: shows a clear 'server unreachable' message, retries by itself, and recovers", async ({ page }) => {
  let down = true;
  await page.route(API, (route) => (down ? route.abort("connectionrefused") : route.continue()));
  await page.goto("/");
  await expect(page.getByTestId("server-down")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("server-down")).toContainText("Can't reach the iMello server");
  down = false;
  await expect(page.getByTestId("server-down")).toBeHidden({ timeout: 30_000 }); // automatic retry (every 8 s)
});
