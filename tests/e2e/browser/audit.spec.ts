/** Usability audit (opt-in AUDIT=<dir>): screenshots + mechanical checks on real screens. */
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
const dir = process.env.AUDIT;
test.skip(!dir, "set AUDIT=<dir>");

async function quick(p: Page, name: string) {
  await p.goto("/");
  await p.getByLabel("Your name (optional)").fill(name);
  await p.getByRole("button", { name: "Start now" }).click();
  await expect(p.getByRole("navigation", { name: "iMello" })).toBeVisible({ timeout: 60_000 });
}
async function measure(p: Page, label: string) {
  const r = await p.evaluate(() => {
    const vis = (e: Element) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
    const small = Array.from(document.querySelectorAll("button, a[href], input, [role=button], [role=radio], [role=tab]")).filter(vis)
      .filter((e) => { const b = e.getBoundingClientRect(); return (b.height < 40 || b.width < 40) && !(e as HTMLInputElement).type?.match(/checkbox|radio/); })
      .map((e) => `${e.tagName}.${(e as HTMLElement).className}|${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 20)}|${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    const radii = new Set<string>(), colors = new Set<string>();
    for (const e of Array.from(document.querySelectorAll("body *"))) { if (!vis(e)) continue; const s = getComputedStyle(e); if (s.borderTopLeftRadius !== "0px") radii.add(s.borderTopLeftRadius); if (s.backgroundColor !== "rgba(0, 0, 0, 0)") colors.add(s.backgroundColor); }
    const emoji = Array.from(document.querySelectorAll("button, h1, h2, h3, nav, header, label, legend")).filter(vis).map((e) => e.textContent || "").filter((t) => /\p{Extended_Pictographic}/u.test(t)).map((t) => t.trim().slice(0, 30));
    const hscroll = document.documentElement.scrollWidth > innerWidth + 1;
    return { small: [...new Set(small)], radii: [...radii], colors: [...colors], emoji: [...new Set(emoji)], hscroll };
  });
  writeFileSync(`${dir}/${label}.json`, JSON.stringify(r, null, 1));
  await p.screenshot({ path: `${dir}/${label}.png` });
}

test("audit", async ({ browser }) => {
  test.setTimeout(240_000);
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
  const a = await (await browser.newContext(phone)).newPage();
  const b = await (await browser.newContext(phone)).newPage();
  await a.goto("/"); await a.waitForLoadState("networkidle"); await measure(a, "00-auth");
  await quick(a, "Mona"); await quick(b, "Omar");
  await a.getByRole("link", { name: "Settings" }).click();
  const pin = (await a.getByTestId("my-pin").textContent())!.trim();
  await measure(a, "05-settings");
  await b.getByRole("link", { name: "Settings" }).click();
  await b.getByRole("link", { name: /Add people/ }).click();
  await measure(b, "03-contacts");
  await b.getByTestId("pin-input").fill(pin.replace(/mell-/i, ""));
  await b.getByRole("button", { name: "Add", exact: true }).click();
  await a.getByRole("link", { name: "Chats" }).click();
  await expect(a.getByTestId("requests-banner")).toBeVisible({ timeout: 40_000 });
  await measure(a, "01b-chats-requests");
  await a.getByTestId("requests-banner").click();
  const req = a.getByTestId("incoming-request");
  await expect(req).toBeVisible({ timeout: 30_000 });
  await measure(a, "04-contacts-request");
  await req.getByRole("button", { name: "Accept" }).click();
  await a.getByRole("button", { name: "Message" }).click();
  await expect(a.getByText("End-to-end encrypted")).toBeVisible();
  await a.getByLabel("Message", { exact: true }).fill("Hi Omar");
  await a.keyboard.press("Enter");
  await b.getByRole("link", { name: "Chats" }).click();
  await b.getByRole("link", { name: /invited you to chat/ }).click();
  await b.getByRole("button", { name: "Accept chat" }).click();
  for (const t of ["Dinner Friday?", "يا هلا"]) { await b.getByLabel("Message", { exact: true }).fill(t); await b.keyboard.press("Enter"); }
  await a.waitForTimeout(2000);
  await measure(a, "02-conversation");
  await a.getByRole("button", { name: "Back" }).first().click();
  await measure(a, "01-chats");
  await a.getByRole("link", { name: /Omar/ }).first().click();
  await a.emulateMedia({ colorScheme: "dark" });
  await measure(a, "02-conversation-darkpref");
  await a.emulateMedia({ colorScheme: "light" });
  // New group from Settings → Contacts and invitations.
  await a.getByRole("button", { name: "Back" }).first().click();
  await a.getByRole("link", { name: "Settings" }).click();
  await measure(a, "05b-settings-top");
  await a.getByRole("link", { name: /Add people/ }).click();
  await a.getByRole("button", { name: "New group" }).click();
  await a.getByLabel("Group name").fill("Family dinner");
  await a.getByRole("checkbox", { name: "Omar" }).check();
  await measure(a, "08-new-group");
  await a.getByRole("button", { name: "Create group" }).click();
  await expect(a.locator(".conv-title").filter({ hasText: "Family dinner" })).toBeVisible({ timeout: 30_000 });
  await b.getByRole("button", { name: "Back" }).first().click().catch(() => undefined);
  await expect(b.locator(".conv-name").filter({ hasText: "Family dinner" }).first()).toBeVisible({ timeout: 30_000 });
  await measure(a, "09-group-chat");
  await a.getByRole("button", { name: "Back" }).first().click();
  await a.getByRole("link", { name: "Settings" }).click();
  await a.getByRole("radio", { name: "العربية" }).click();
  await measure(a, "06-settings-ar");
  await a.getByRole("link", { name: "المحادثات" }).click();
  await a.getByRole("link", { name: /Omar/ }).first().click();
  await a.waitForTimeout(800);
  await measure(a, "07-conversation-ar");
});
