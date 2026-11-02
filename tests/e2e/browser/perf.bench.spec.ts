/**
 * Performance benchmark (not part of the normal suite): BENCH=1 BENCH_LABEL=before npx playwright test perf.bench
 * Measures in a real browser against the local stack, with a 300-message encrypted conversation:
 *  - restoreMs: reload → chat list visible (session restore incl. crypto init + first sync)
 *  - openMs: tap conversation → newest message visible
 *  - burst: main-thread long tasks (>50 ms) while 40 messages arrive in the open conversation
 */
import { writeFileSync } from "node:fs";
import { sendText, startDirectChat, waitForRoom, acceptInvite } from "@imello/core/messaging";
import { expect, test } from "@playwright/test";
import { connect, PASSWORD, registerAdult, stopAll } from "../src/harness";

test.skip(!process.env.BENCH, "set BENCH=1");
test.afterAll(stopAll);

test("benchmark", async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await registerAdult("benchA", "Bench A");
  const b = await registerAdult("benchB", "Bench B");
  await connect(a, b);
  const roomId = await startDirectChat(b.client, a.userId);
  await waitForRoom(a.client, roomId);
  await acceptInvite(a.client, roomId);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByLabel("iMello number or username").fill(a.username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).last().click();
  await expect(page.locator("nav.tabbar")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(".conv-row").first()).toBeVisible({ timeout: 60_000 });
  // Sent after the browser device exists, so it can decrypt them (E2EE: new devices can't read older history).
  for (let i = 0; i < 300; i++) await sendText(b.client, roomId, `history message ${i} — نص عربي للتجربة`);
  await expect(page.locator(".conv-row").first()).toContainText("history message 299", { timeout: 120_000 });
  await page.waitForTimeout(10_000); // let sync settle so reload timings measure restore, not catch-up

  const results: Record<string, number> = {};
  const runs = 3;
  let restore = 0;
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    await page.reload();
    await expect(page.locator(".conv-row").first()).toBeVisible({ timeout: 120_000 });
    restore += Date.now() - t0;
  }
  results.restoreMs = Math.round(restore / runs);

  let open = 0;
  const openRuns: number[] = [];
  for (let i = 0; i < runs; i++) {
    await page.goto("/#/chats");
    await expect(page.locator(".conv-row").first()).toBeVisible();
    const t0 = Date.now();
    await page.locator(".conv-row").first().click();
    await expect(page.getByTestId("message").filter({ hasText: "history message 299" })).toBeVisible({ timeout: 60_000 });
    open += Date.now() - t0;
    openRuns.push(Date.now() - t0);
  }
  results.openMs = Math.round(open / runs);
  results.openFirstMs = openRuns[0]!;
  results.openRepeatMs = Math.round((openRuns[1]! + openRuns[2]!) / 2);
  if (process.env.BENCH_PROFILE) {
    const cdp = await ctx.newCDPSession(page);
    await page.goto("/#/chats");
    await expect(page.locator(".conv-row").first()).toBeVisible();
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    const p0 = Date.now();
    await page.locator(".conv-row").first().click();
    await expect(page.getByTestId("message").filter({ hasText: "history message 299" })).toBeVisible({ timeout: 60_000 });
    const { profile } = await cdp.send("Profiler.stop");
    const self = new Map<string, number>();
    const dt = profile.timeDeltas ?? [];
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    (profile.samples ?? []).forEach((id, i) => {
      const n = byId.get(id)!;
      const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`;
      self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
    });
    console.log("PROFILE open", Date.now() - p0, "ms", JSON.stringify([...self].sort((x, y) => y[1] - x[1]).slice(0, 15).map(([k, v]) => [k, Math.round(v)])));
  }
  results.domNodesInConversation = await page.evaluate(() => document.querySelectorAll("*").length);

  await page.evaluate(() => {
    const w = window as unknown as { __lt: number[] };
    w.__lt = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push(e.duration))).observe({ type: "longtask", buffered: false });
  });
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) await sendText(b.client, roomId, `burst ${i}`);
  await expect(page.getByTestId("message").filter({ hasText: "burst 39" })).toBeVisible({ timeout: 60_000 });
  results.burstReceiveMs = Date.now() - t0;
  const lt = await page.evaluate(() => (window as unknown as { __lt: number[] }).__lt);
  results.burstLongTasks = lt.length;
  results.burstLongTaskMsTotal = Math.round(lt.reduce((s, d) => s + d, 0));
  results.burstLongTaskMsMax = Math.round(Math.max(0, ...lt));

  const label = process.env.BENCH_LABEL ?? "run";
  writeFileSync(`test-results/bench-${label}.json`, JSON.stringify(results, null, 2));
  console.log("BENCH", label, JSON.stringify(results));
});
