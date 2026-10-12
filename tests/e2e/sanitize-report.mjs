import { readFile, mkdir, writeFile } from "node:fs/promises";
import { safeHttpResponseAnnotations } from "./http-response-evidence.mjs";
let source;
try { source = JSON.parse(await readFile("test-results/playwright.json", "utf8")); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  await mkdir("docs/qa", { recursive: true });
  await writeFile("docs/qa/browser-summary.json", JSON.stringify({ generatedAt: new Date().toISOString(), status: "not_run", reason: "No Playwright report generated in this execution", tests: [] }, null, 2));
  console.log("Recorded browser tests as not run; no Playwright report exists.");
  process.exit(0);
}
const tests = [];
function safeAuthStatuses(annotations = []) {
  const allowedStages = ["password-sign-in", "mfa-enable", "totp-enrollment", "totp-renewal", "customer-otp-send", "customer-otp-verify", "customer-otp-wrong-code"];
  const allowedCategories = ["admin-sign-in-email", "admin-two-factor-enable", "admin-two-factor-verify-totp", "customer-phone-send-otp", "customer-phone-verify"];
  const statuses = [];
  for (const annotation of annotations) {
    if (annotation.type !== "native-auth-status") continue;
    let item;
    try { item = JSON.parse(annotation.description); } catch { continue; }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (!allowedStages.includes(item.stage) || !allowedCategories.includes(item.category) || ![1, 2].includes(item.attempt) || !Number.isInteger(item.status) || item.status < 100 || item.status > 599) continue;
    if (!(["retry-after", "x-retry-after", "absent"].includes(item.retryAfterHeader)) || !(item.retryAfterSeconds === null || Number.isInteger(item.retryAfterSeconds) && item.retryAfterSeconds >= 0 && item.retryAfterSeconds <= 60)) continue;
    statuses.push({ stage: item.stage, category: item.category, attempt: item.attempt, status: item.status, retryAfterSeconds: item.retryAfterSeconds, retryAfterHeader: item.retryAfterHeader });
  }
  return statuses;
}
function safeMetadataStatuses(annotations = []) {
  const statuses = [];
  for (const annotation of annotations) {
    if (annotation.type !== "public-metadata-status") continue;
    let item;
    try { item = JSON.parse(annotation.description); } catch { continue; }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (!["products", "account", "admin-login"].includes(item.alias) || !["navigation", "sort-asc", "sort-desc", "before-axe", "after-axe"].includes(item.phase)) continue;
    if (!(item.httpStatus === null || Number.isInteger(item.httpStatus) && item.httpStatus >= 100 && item.httpStatus <= 599) || typeof item.titlePresent !== "boolean" || typeof item.expectedTitleMatches !== "boolean") continue;
    if (!["loading", "interactive", "complete"].includes(item.readyState) || !["observed", "ready", "failed"].includes(item.readiness)) continue;
    statuses.push({ alias: item.alias, phase: item.phase, httpStatus: item.httpStatus, titlePresent: item.titlePresent, expectedTitleMatches: item.expectedTitleMatches, readyState: item.readyState, readiness: item.readiness });
  }
  return statuses;
}
function safeAdminReadiness(annotations = []) {
  const statuses = [];
  for (const annotation of annotations) {
    if (annotation.type !== "admin-readiness-status") continue;
    let item;
    try { item = JSON.parse(annotation.description); } catch { continue; }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (!["admin-home", "admin-products-new"].includes(item.expectedAlias) || !["admin-home", "admin-products-new", "admin-login", "other"].includes(item.actualAlias)) continue;
    if (!(item.documentHttpStatus === null || Number.isInteger(item.documentHttpStatus) && item.documentHttpStatus >= 100 && item.documentHttpStatus <= 599) || !Number.isInteger(item.sessionHttpStatus) || item.sessionHttpStatus < 100 || item.sessionHttpStatus > 599) continue;
    if (typeof item.mfaVerified !== "boolean" || typeof item.roleAllowed !== "boolean" || !(item.formPresent === null || typeof item.formPresent === "boolean") || !["observed", "ready", "failed"].includes(item.readiness)) continue;
    statuses.push({ expectedAlias: item.expectedAlias, actualAlias: item.actualAlias, documentHttpStatus: item.documentHttpStatus, sessionHttpStatus: item.sessionHttpStatus, mfaVerified: item.mfaVerified, roleAllowed: item.roleAllowed, formPresent: item.formPresent, readiness: item.readiness });
  }
  return statuses;
}
function walk(suite) {
  for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? []) {
    tests.push({ title: spec.title, project: test.projectName, status: result.status, durationMs: result.duration, retry: result.retry, errorCount: result.errors?.length ?? 0, nativeAuthStatuses: safeAuthStatuses(test.annotations), publicMetadataStatuses: safeMetadataStatuses(test.annotations), adminReadiness: safeAdminReadiness(test.annotations), httpResponses: safeHttpResponseAnnotations(test.annotations) });
  }
  for (const child of suite.suites ?? []) walk(child);
}
for (const suite of source.suites ?? []) walk(suite);
await mkdir("docs/qa", { recursive: true });
await writeFile("docs/qa/browser-summary.json", JSON.stringify({ generatedAt: new Date().toISOString(), startedAt: source.stats?.startTime, durationMs: source.stats?.duration, expected: source.stats?.expected, unexpected: source.stats?.unexpected, skipped: source.stats?.skipped, flaky: source.stats?.flaky, tests }, null, 2));
console.log(`Wrote ${tests.length} safe result summaries without errors, snapshots, request headers, response bodies, or raw traces.`);
