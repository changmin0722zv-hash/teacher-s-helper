import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 7000 },
  use: {
    actionTimeout: 10000,
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1050 },
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: "LOCAL_DEMO=true npm run dev -- --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
