import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests against the *production build* of the web client
 * (served by `vite preview`, with the production Content-Security-Policy).
 * Requires the backend dev stack: `bash scripts/dev-stack.sh start`.
 */
export default defineConfig({
  testDir: "./browser",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm --filter @imello/web run build && pnpm --filter @imello/web run preview",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 180_000,
    cwd: "../..",
  },
});
