import { readFile, mkdir, writeFile } from "node:fs/promises";
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
function walk(suite) {
  for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? []) {
    tests.push({ title: spec.title, project: test.projectName, status: result.status, durationMs: result.duration, retry: result.retry, errorCount: result.errors?.length ?? 0 });
  }
  for (const child of suite.suites ?? []) walk(child);
}
for (const suite of source.suites ?? []) walk(suite);
await mkdir("docs/qa", { recursive: true });
await writeFile("docs/qa/browser-summary.json", JSON.stringify({ generatedAt: new Date().toISOString(), startedAt: source.stats?.startTime, durationMs: source.stats?.duration, expected: source.stats?.expected, unexpected: source.stats?.unexpected, skipped: source.stats?.skipped, flaky: source.stats?.flaky, tests }, null, 2));
console.log(`Wrote ${tests.length} safe result summaries without errors, snapshots, request headers, response bodies, or raw traces.`);
