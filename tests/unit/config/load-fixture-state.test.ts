import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readLoadFixtureState, validateLoadFixtureState } from "../../../scripts/load-fixture-state.mjs";

function records() {
  const fixtureId: string = randomUUID(), ids = Array.from({ length: 200 }, () => randomUUID());
  const variants = ids.map(() => randomUUID());
  const meta = { fixtureId, createdAt: "2026-10-12T10:00:00.000Z", completedAt: "2026-10-12T10:20:00.000Z", appCommit: "a".repeat(40), environment: "staging", baseURL: "http://localhost:3100", reconciliationRequired: false };
  const users = ids.map((_, index) => ({ userId: `synthetic-${index}`, cookies: [{ name: "controlled-session", value: "private-cookie-canary" }] }));
  return {
    fixture: { ...meta, setupStatus: "complete", productId: ids[0], productIds: ids, variantId: variants[0], initialStock: 100000, users },
    progress: { ...meta, formatVersion: 1, state: "complete", failure: null, setupBudgetMs: 1800000, products: ids.map((id, index) => ({ id, variantId: variants[index], phase: "created" })), accounts: users.map(user => ({ userId: user.userId, phase: "session-ready" })) },
    latest: { ...meta, formatVersion: 1, state: "complete" },
    configuration: { LOAD_APP_COMMIT: "A".repeat(40), APP_BASE_URL: meta.baseURL, DEPLOYMENT_ENV: "staging", PAYMENT_PROVIDER: "mock", SMS_PROVIDER: "mock" },
  };
}
describe("load readiness binds the latest complete fixture to the actual target", () => {
  it("accepts matching complete records without deriving the app revision from local Git", () => {
    const r = records();
    expect(validateLoadFixtureState(r.fixture, r.progress, r.latest, r.configuration)).toBe(r.fixture);
  });
  const mutations: [string, (r: ReturnType<typeof records>) => void][] = [
    ["missing explicit accepted source", r => { r.configuration.LOAD_APP_COMMIT = ""; }],
    ["different app source", r => { r.progress.appCommit = "b".repeat(40); }],
    ["newer incomplete attempt", r => { r.latest.fixtureId = randomUUID(); r.latest.state = "partial"; }],
    ["same attempt still preparing", r => { r.latest.state = "preparing"; }],
    ["unknown native outcome", r => { r.progress.reconciliationRequired = true; }],
    ["different environment", r => { r.latest.environment = "test"; }],
    ["different app origin", r => { r.configuration.APP_BASE_URL = "http://localhost:3101"; }],
    ["query-bearing target", r => { r.configuration.APP_BASE_URL += "?"; }],
    ["invalid namespace", r => { r.fixture.fixtureId = "../../private"; }],
    ["legacy fixture without completion", r => { r.fixture.setupStatus = ""; }],
    ["different completion record", r => { r.latest.completedAt = "2026-10-12T10:21:00.000Z"; }],
    ["unfinished product mutation", r => { r.progress.products[199]!.phase = "planned"; }],
    ["duplicated product", r => { r.fixture.productIds[199] = r.fixture.productIds[0]!; }],
    ["unfinished native session", r => { r.progress.accounts[199]!.phase = "verified"; }],
    ["different native account", r => { r.progress.accounts[199]!.userId = "another-account"; }],
    ["missing native cookie", r => { r.fixture.users[199]!.cookies = []; }],
    ["real provider", r => { r.configuration.PAYMENT_PROVIDER = "real"; }],
  ];
  it.each(mutations)("refuses %s", (_, mutate) => {
    const r = records(); mutate(r);
    expect(() => validateLoadFixtureState(r.fixture, r.progress, r.latest, r.configuration)).toThrow(/^Load fixture is not a complete matching latest preparation; reconcile private records before running$/u);
  });
  it("reads matching bounded private records and refuses a missing latest pointer", async () => {
    const r = records(), directory = await mkdtemp(join(tmpdir(), "morphiume-readiness-"));
    const fixturePath = join(directory, "fixture.json"), pointer = join(directory, "load-setup-latest.json");
    try {
      await writeFile(fixturePath, JSON.stringify(r.fixture));
      await writeFile(join(directory, `load-setup-progress-${r.fixture.fixtureId}.json`), JSON.stringify(r.progress));
      await expect(readLoadFixtureState(fixturePath, r.configuration, directory)).rejects.toThrow(/^Load fixture is not/u);
      await writeFile(pointer, JSON.stringify(r.latest));
      expect((await readLoadFixtureState(fixturePath, r.configuration, directory)).fixtureId).toBe(r.fixture.fixtureId);
      await writeFile(pointer, " ".repeat(8193));
      await expect(readLoadFixtureState(fixturePath, r.configuration, directory)).rejects.toThrow(/^Load fixture is not/u);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("rejects malformed private JSON without reflecting cookie or parser contents", async () => {
    const r = records(), directory = await mkdtemp(join(tmpdir(), "morphiume-readiness-"));
    try {
      const fixturePath = join(directory, "fixture.json");
      await writeFile(fixturePath, '{"secret":"private-cookie-canary"');
      await expect(readLoadFixtureState(fixturePath, r.configuration, directory)).rejects.toThrow(/^Load fixture is not a complete matching latest preparation; reconcile private records before running$/u);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
