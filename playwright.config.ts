import { defineConfig, devices } from "@playwright/test";

const e2eDistDir = process.env.E2E_DIST_DIR || ".next-e2e";

export default defineConfig({
  testDir: "./tests/e2e",
  // These end-to-end flows share one application server and database.
  // Running them sequentially keeps stateful workflows deterministic.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `NEXT_DIST_DIR=${e2eDistDir} npm run dev -- -p 3100`,
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
