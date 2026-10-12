import { describe, expect, it } from "vitest";
import { FixtureSetupBudget, FixtureSetupFailure, FIXTURE_SETUP_BUDGET_MS, nativeFixtureAuthAction, nativeFixtureOtpPair, safeFixtureFailure, type FixtureAuthEvidence } from "../../load/native-fixture-actions";

function controlledBudget(durationMs = FIXTURE_SETUP_BUDGET_MS) {
  let elapsed = 0;
  const waits: number[] = [];
  const budget = new FixtureSetupBudget(() => elapsed, async milliseconds => { waits.push(milliseconds); elapsed += milliseconds; }, durationMs);
  return { budget, waits, advance: (milliseconds: number) => { elapsed += milliseconds; } };
}
const limited = (headers: Record<string, string> = {}) => new Response("PRIVATE OTP body", { status: 429, headers });
const invalidIntervals: Record<string, string>[] = [{}, { "retry-after": "PRIVATE" }, { "retry-after": "-1" }, { "retry-after": "61" }, { "retry-after": "Infinity" }, { "retry-after": "1e1" }, { "retry-after": "Mon, 12 Oct 2026 00:00:00 GMT" }, { "x-retry-after": "NaN" }, { "retry-after": "999999999999999999999" }];
describe("native load-fixture actions respect observed quotas and preserve denials", () => {
  it("retries once after the native X-Retry-After interval and never reads/publishes the body", async () => {
    const { budget, waits } = controlledBudget(), evidence: FixtureAuthEvidence[] = [];
    let calls = 0;
    const response = await nativeFixtureAuthAction("customer-otp-send", budget, async () => ++calls === 1 ? limited({ "x-retry-after": "7", "set-cookie": "PRIVATE", "x-provider-ref": "PRIVATE" }) : new Response("PRIVATE session", { status: 200 }), item => evidence.push(item));
    expect(calls).toBe(2); expect(waits).toEqual([7250]); expect(response.status).toBe(200); expect(response.bodyUsed).toBe(false);
    expect(evidence).toEqual([{ stage: "customer-otp-send", attempt: 1, status: 429, retryAfterSeconds: 7, retryAfterHeader: "x-retry-after" }, { stage: "customer-otp-send", attempt: 2, status: 200, retryAfterSeconds: null, retryAfterHeader: "absent" }]);
    expect(JSON.stringify(evidence)).not.toContain("PRIVATE");
  });
  it("prefers a numeric Retry-After and splits the maximum wait into finite polls", async () => {
    const { budget, waits } = controlledBudget(); let calls = 0;
    await nativeFixtureAuthAction("customer-otp-send", budget, async () => ++calls === 1 ? limited({ "retry-after": "60", "x-retry-after": "1" }) : new Response(null, { status: 200 }));
    expect(waits).toEqual([60_000, 250]); expect(waits.every(value => Number.isFinite(value) && value <= 60_000)).toBe(true);
  });
  it("re-reads the current controlled OTP on verify retry without invoking a send action", async () => {
    const { budget, waits } = controlledBudget(), requests: { path: string; code?: string }[] = []; let reads = 0;
    await nativeFixtureOtpPair("+989121234567", budget, async (path, body) => {
      requests.push({ path, code: body.code });
      return path === "/phone-number/verify" && requests.length === 2 ? limited({ "retry-after": "0.5" }) : new Response(null, { status: 200 });
    }, async () => ++reads === 1 ? "111111" : "222222");
    expect(requests).toEqual([{ path: "/phone-number/send-otp", code: undefined }, { path: "/phone-number/verify", code: "111111" }, { path: "/phone-number/verify", code: "222222" }]);
    expect(reads).toBe(2); expect(waits).toEqual([750]);
  });
  it("does not send again or verify with a made-up code when the current inbox has expired", async () => {
    const { budget } = controlledBudget(), paths: string[] = [];
    const failure = await nativeFixtureOtpPair("+989121234567", budget, async path => { paths.push(path); return new Response(null, { status: 200 }); }, async () => undefined).catch(error => error);
    expect(paths).toEqual(["/phone-number/send-otp"]); expect(safeFixtureFailure(failure)).toEqual({ code: "fixture-inbox-invalid", stage: "customer-otp-verify", status: null });
  });
  it.each([400, 401, 403, 500, 503])("does not retry HTTP %i or disclose its denial body", async status => {
    const { budget, waits } = controlledBudget(); let calls = 0;
    const failure = await nativeFixtureAuthAction("customer-otp-verify", budget, async () => { calls++; return new Response("PRIVATE denial and token", { status, headers: { "retry-after": "1" } }); }).catch(error => error);
    expect(calls).toBe(1); expect(waits).toEqual([]); expect(safeFixtureFailure(failure)).toEqual({ code: "native-http-denied", stage: "customer-otp-verify", status });
    expect(JSON.stringify(safeFixtureFailure(failure))).not.toContain("PRIVATE");
  });
  it.each(invalidIntervals)("fails closed when there is no approved numeric retry interval %#", async headers => {
    const { budget, waits } = controlledBudget(), evidence: FixtureAuthEvidence[] = []; let calls = 0;
    const failure = await nativeFixtureAuthAction("customer-otp-send", budget, async () => { calls++; return limited(headers); }, item => evidence.push(item)).catch(error => error);
    expect(calls).toBe(1); expect(waits).toEqual([]); expect(safeFixtureFailure(failure).code).toBe("retry-interval-unavailable");
    expect(JSON.stringify(evidence)).not.toContain("PRIVATE");
  });
  it("stops at the second actual429, rather than extending into a relogin loop", async () => {
    const { budget, waits } = controlledBudget(); let calls = 0;
    const failure = await nativeFixtureAuthAction("customer-otp-send", budget, async () => { calls++; return limited({ "x-retry-after": "2" }); }).catch(error => error);
    expect(calls).toBe(2); expect(waits).toEqual([2250]); expect(safeFixtureFailure(failure)).toMatchObject({ code: "native-http-denied", status: 429 });
  });
  it("does not issue the second action when its required wait would exceed setup budget", async () => {
    const { budget, waits } = controlledBudget(1000); let calls = 0;
    const failure = await nativeFixtureAuthAction("customer-otp-send", budget, async () => { calls++; return limited({ "retry-after": "1" }); }).catch(error => error);
    expect(calls).toBe(1); expect(waits).toEqual([]); expect(safeFixtureFailure(failure).code).toBe("deadline");
  });
  it("does not start an operation after the controlled deadline", async () => {
    const { budget, advance } = controlledBudget(1000); advance(1000); let calls = 0;
    await expect(budget.run(async () => { calls++; return 1; })).rejects.toBeInstanceOf(FixtureSetupFailure);
    expect(calls).toBe(0);
  });
  it("bounds an unresolved action, aborts its signal and keeps the outcome unclassified", async () => {
    const budget = new FixtureSetupBudget(() => 0, undefined, 15); let signal: AbortSignal | undefined;
    const failure = await budget.run(async value => { signal = value; return await new Promise<never>(() => {}); }).catch(error => error);
    expect(signal?.aborted).toBe(true); expect(safeFixtureFailure(failure)).toEqual({ code: "deadline", stage: null, status: null });
  });
  it("strips raw handler errors without reading their private message or cause", async () => {
    const { budget } = controlledBudget();
    const failure = await nativeFixtureAuthAction("customer-otp-send", budget, async () => { throw new Error("PRIVATE password/code/token/provider", { cause: "PRIVATE" }); }).catch(error => error);
    expect(safeFixtureFailure(failure)).toEqual({ code: "native-handler-failed", stage: "customer-otp-send", status: null });
    expect(JSON.stringify(failure)).not.toContain("PRIVATE"); expect(safeFixtureFailure({ message: "PRIVATE", token: "PRIVATE" })).toEqual({ code: "fixture-operation-failed", stage: null, status: null });
  });
  it("does not trust mutated category fields or throwing error accessors", () => {
    const mutated = new FixtureSetupFailure("deadline");
    Object.defineProperty(mutated, "code", { value: "PRIVATE", configurable: true });
    expect(safeFixtureFailure(mutated)).toEqual({ code: "fixture-operation-failed", stage: null, status: null });
    Object.defineProperty(mutated, "code", { get: () => { throw new Error("PRIVATE"); } });
    expect(safeFixtureFailure(mutated)).toEqual({ code: "fixture-operation-failed", stage: null, status: null });
  });
  it("records private phase checkpoints before the matching native action starts", async () => {
    const { budget } = controlledBudget(), phases: string[] = [];
    await nativeFixtureOtpPair("+989121234567", budget, async path => { phases.push(path); return new Response(null, { status: 200 }); }, async () => "111111", undefined, async phase => { phases.push(phase); });
    expect(phases).toEqual(["sending", "/phone-number/send-otp", "verifying", "/phone-number/verify"]);
  });
});
