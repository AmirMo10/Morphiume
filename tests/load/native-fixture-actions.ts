export const FIXTURE_SETUP_BUDGET_MS = 30 * 60_000;
const stages = new Set(["customer-otp-send", "customer-otp-verify"]);
const codes = new Set(["deadline", "retry-interval-unavailable", "native-http-denied", "native-handler-failed", "native-response-invalid", "fixture-operation-failed", "fixture-progress-failed", "fixture-inbox-invalid", "fixture-session-invalid", "fixture-target-invalid"]);
export type FixtureAuthStage = "customer-otp-send" | "customer-otp-verify";
export type FixtureFailureCode = "deadline" | "retry-interval-unavailable" | "native-http-denied" | "native-handler-failed" | "native-response-invalid" | "fixture-operation-failed" | "fixture-progress-failed" | "fixture-inbox-invalid" | "fixture-session-invalid" | "fixture-target-invalid";
export type FixtureAuthEvidence = { stage: FixtureAuthStage; attempt: 1 | 2; status: number; retryAfterSeconds: number | null; retryAfterHeader: "retry-after" | "x-retry-after" | "absent" | "invalid" };

export class FixtureSetupFailure extends Error {
  constructor(public readonly code: FixtureFailureCode, public readonly stage: FixtureAuthStage | null = null, public readonly status: number | null = null) {
    super("Controlled fixture setup stopped.");
    if (!codes.has(code) || !(stage === null || stages.has(stage)) || !(status === null || Number.isInteger(status) && status >= 100 && status <= 599)) throw new Error("Invalid controlled fixture failure category.");
    this.name = "FixtureSetupFailure";
  }
}
export function safeFixtureFailure(error: unknown) {
  try {
    if (error instanceof FixtureSetupFailure && codes.has(error.code) && (error.stage === null || stages.has(error.stage)) && (error.status === null || Number.isInteger(error.status) && error.status >= 100 && error.status <= 599)) return { code: error.code, stage: error.stage, status: error.status };
  } catch { /* Never publish an error getter or raw thrown object. */ }
  return { code: "fixture-operation-failed" as const, stage: null, status: null };
}

/** An operation deadline is not a promise that a native DB transaction was cancelled. */
export class FixtureSetupBudget {
  private readonly deadline: number;
  constructor(private readonly now: () => number = () => performance.now(), private readonly sleep: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), durationMs = FIXTURE_SETUP_BUDGET_MS) {
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > FIXTURE_SETUP_BUDGET_MS || !Number.isFinite(now())) throw new FixtureSetupFailure("deadline");
    this.deadline = now() + durationMs;
  }
  assertActive() {
    const remaining = this.deadline - this.now();
    if (!Number.isFinite(remaining) || remaining <= 0) throw new FixtureSetupFailure("deadline");
    return remaining;
  }
  async run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const remaining = this.assertActive(), controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new FixtureSetupFailure("deadline")); }, Math.ceil(remaining));
      });
      const result = await Promise.race([operation(controller.signal), timeout]);
      this.assertActive();
      return result;
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
  async wait(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 60_250 || milliseconds >= this.assertActive()) throw new FixtureSetupFailure("deadline");
    let left = milliseconds;
    while (left > 0) {
      const chunk = Math.min(left, 60_000);
      await this.run(() => this.sleep(chunk));
      left -= chunk;
    }
  }
}

function retryInterval(response: Response): Pick<FixtureAuthEvidence, "retryAfterSeconds" | "retryAfterHeader"> {
  for (const header of ["retry-after", "x-retry-after"] as const) {
    const value = response.headers.get(header);
    if (value === null) continue;
    const seconds = value.length <= 16 && /^\d+(?:\.\d+)?$/u.test(value) ? Number(value) : NaN;
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60) return { retryAfterSeconds: null, retryAfterHeader: "invalid" };
    return { retryAfterSeconds: seconds, retryAfterHeader: header };
  }
  return { retryAfterSeconds: null, retryAfterHeader: "absent" };
}

export async function nativeFixtureAuthAction(stage: FixtureAuthStage, budget: FixtureSetupBudget, action: (attempt: 1 | 2, signal: AbortSignal) => Promise<Response>, observe: (evidence: FixtureAuthEvidence) => void = () => {}): Promise<Response> {
  if (!stages.has(stage)) throw new FixtureSetupFailure("native-response-invalid");
  for (const attempt of [1, 2] as const) {
    let response: Response;
    try { response = await budget.run(signal => action(attempt, signal)); }
    catch (error) { throw error instanceof FixtureSetupFailure ? error : new FixtureSetupFailure("native-handler-failed", stage); }
    if (!(response instanceof Response) || response.status < 100 || response.status > 599) throw new FixtureSetupFailure("native-response-invalid", stage);
    const interval = response.status === 429 ? retryInterval(response) : { retryAfterSeconds: null, retryAfterHeader: "absent" as const };
    const evidence: FixtureAuthEvidence = { stage, attempt, status: response.status, ...interval };
    observe(evidence); // Only reconstructed, fixed fields; never a response body or raw header.
    if (response.status === 200) return response;
    if (response.status === 429 && attempt === 1) {
      if (interval.retryAfterSeconds === null) throw new FixtureSetupFailure("retry-interval-unavailable", stage, 429);
      await budget.wait(Math.ceil(interval.retryAfterSeconds * 1000) + 250);
      continue;
    }
    throw new FixtureSetupFailure("native-http-denied", stage, response.status);
  }
  throw new FixtureSetupFailure("native-response-invalid", stage);
}

export type FixturePhonePath = "/phone-number/send-otp" | "/phone-number/verify";
export async function nativeFixtureOtpPair(phone: string, budget: FixtureSetupBudget, request: (path: FixturePhonePath, body: { phoneNumber: string; code?: string }, signal: AbortSignal) => Promise<Response>, readCurrentOtp: () => Promise<string | null | undefined>, observe: (evidence: FixtureAuthEvidence) => void = () => {}, beforePhase: (phase: "sending" | "verifying") => Promise<void> = async () => {}) {
  await budget.run(() => beforePhase("sending"));
  await nativeFixtureAuthAction("customer-otp-send", budget, (_attempt, signal) => request("/phone-number/send-otp", { phoneNumber: phone }, signal), observe);
  await budget.run(() => beforePhase("verifying"));
  return nativeFixtureAuthAction("customer-otp-verify", budget, async (_attempt, signal) => {
    const code = await budget.run(() => readCurrentOtp());
    if (typeof code !== "string" || !/^\d{6}$/u.test(code)) throw new FixtureSetupFailure("fixture-inbox-invalid", "customer-otp-verify");
    return request("/phone-number/verify", { phoneNumber: phone, code }, signal);
  }, observe);
}
