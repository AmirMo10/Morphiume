import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { privatePreviewSettings } from "./private-preview-support";

// Only Root's protected environment; no dotenv or default/ambient local target.
if (existsSync(".env.local")) throw new Error("Private preview requires a fresh runner without an ambient env file.");
const settings = privatePreviewSettings(process.env);
if (!settings) throw new Error("Explicit E4 private-preview mode is required.");
export default defineConfig({
  testDir: ".", testMatch: "full-purchase.spec.ts", fullyParallel: false, workers: 1,
  retries: 0, forbidOnly: true, timeout: 120_000, globalTimeout: 10 * 60_000,
  outputDir: "../../test-results/private-preview/browser",
  reporter: [["list"], ["json", { outputFile: "../../test-results/private-preview/result.json" }]],
  // Credentials are applied inside the test to its actual browser/API contexts,
  // never serialized into reporter config, traces or credential-bearing errors.
  use: { baseURL: settings.origin, trace: "off", screenshot: "off", video: "off", actionTimeout: 10_000 },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1366, height: 768 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1366, height: 768 } } },
  ],
});
