/** Reactions, editing and deleting between two independent users (real accounts, encrypted room). */
import { randomBytes } from "node:crypto";
import { expect, test, type Browser } from "@playwright/test";

async function startNow(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await page.getByLabel("Your name (optional)").fill(name);
  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page.getByRole("navigation", { name: "Wanas" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Settings" }).click();
  const pin = (await page.getByTestId("my-pin").textContent())!.trim();
  return { page, pin };
}

test("react, edit and delete are seen by the other person", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await startNow(browser, "Hala");
  const b = await startNow(browser, "Badr");
  await a.page.getByRole("link", { name: /Add people/ }).click();
  await a.page.getByTestId("pin-input").fill(b.pin);
  await a.page.getByRole("button", { name: "Add", exact: true }).click();
  await b.page.getByRole("link", { name: /Add people/ }).click();
  await b.page.getByTestId("incoming-request").getByRole("button", { name: "Accept" }).click({ timeout: 30_000 });
  await b.page.getByRole("button", { name: "Message" }).click();
  await expect(b.page.getByText("End-to-end encrypted")).toBeVisible();
  const text = `Lunch at 2? ${randomBytes(3).toString("hex")}`;
  await b.page.getByLabel("Message", { exact: true }).fill(text);
  await b.page.keyboard.press("Enter");

  await a.page.getByRole("link", { name: "Back" }).click();
  await a.page.getByRole("link", { name: "Chats" }).click();
  await a.page.getByRole("link", { name: /invited you to chat/ }).click();
  await a.page.getByRole("button", { name: "Accept chat" }).click();
  const onA = a.page.getByTestId("message").filter({ hasText: text });
  await expect(onA).toBeVisible({ timeout: 30_000 });

  // Hala reacts with a heart; Badr sees it.
  await onA.getByRole("button", { name: "Message actions" }).click();
  await a.page.getByRole("menuitem", { name: "❤️" }).click();
  await expect(onA.getByRole("button", { name: "❤️ 1" })).toBeVisible({ timeout: 20_000 });
  const onB = b.page.getByTestId("message").filter({ hasText: "Lunch at 2?" });
  await expect(onB.getByRole("button", { name: "❤️ 1" })).toBeVisible({ timeout: 20_000 });

  // Badr edits his message; Hala sees the new text marked as edited.
  const edited = `Lunch at 3 instead ${randomBytes(3).toString("hex")}`;
  await onB.getByRole("button", { name: "Message actions" }).click();
  await b.page.getByRole("menuitem", { name: "Edit" }).click();
  await b.page.getByRole("textbox", { name: "Edit", exact: true }).fill(edited);
  await b.page.getByRole("textbox", { name: "Edit", exact: true }).press("Enter");
  const editedOnA = a.page.getByTestId("message").filter({ hasText: edited });
  await expect(editedOnA).toBeVisible({ timeout: 20_000 });
  await expect(editedOnA.getByText("edited")).toBeVisible();

  // Badr deletes it; Hala sees that it was deleted and the text is gone.
  b.page.once("dialog", (d) => void d.accept());
  await b.page.getByTestId("message").filter({ hasText: edited }).getByRole("button", { name: "Message actions" }).click();
  await b.page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(a.page.getByText("This message was deleted")).toBeVisible({ timeout: 20_000 });
  await expect(a.page.getByText(edited)).toHaveCount(0);
});
