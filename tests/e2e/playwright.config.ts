import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { controlledQaDatabase } from "../helpers/qa-target.mjs";
config({ path: ".env.local", quiet: true });

controlledQaDatabase(process.env);
const baseURL = process.env.E2E_BASE_URL ?? process.env.APP_BASE_URL;
if (!baseURL) throw new Error("E2E_BASE_URL or APP_BASE_URL is required");

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  // Coordinator-authorized budget for 19 cases/engine (38 local,57 CI),
  // retaining unchanged individual action/assertion/native limits and retries.
  globalTimeout: 25 * 60_000,
  forbidOnly: !!process.env.CI,
  outputDir: "../../test-results/browser",
  reporter: [["list"], ["json", { outputFile: "../../test-results/playwright.json" }], ["html", { outputFolder: "../../playwright-report", open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", video: "off", actionTimeout: 10_000 },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...(process.env.E2E_CHROMIUM_CHANNEL === "chrome" ? { channel: "chrome" } : {}), viewport: { width: 1366, height: 768 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1366, height: 768 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1366, height: 768 } } },
  ],
});
