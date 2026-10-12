import { expect, test, type APIResponse, type Response } from "@playwright/test";
import { httpResponseEvidence, type HttpResponseStage } from "./http-response-evidence.mjs";

export function recordSafeHttpResponse(response: APIResponse | Response, stage: HttpResponseStage) {
  const evidence = httpResponseEvidence(stage, response.status(), response.headers()["x-request-id"]);
  console.log(`http-response-status ${JSON.stringify(evidence)}`);
  test.info().annotations.push({ type: "http-response-status", description: JSON.stringify(evidence) });
  return evidence;
}
export async function readSuccessObject(response: APIResponse | Response, stage: HttpResponseStage, status = 200): Promise<Record<string, unknown>> {
  const evidence = recordSafeHttpResponse(response, stage);
  expect(evidence.status, `${stage} actual HTTP status`).toBe(status);
  expect(evidence.serverRequestId !== null, `${stage} server correlation UUID is present`).toBe(true);
  const payload: unknown = await response.json();
  expect(!!payload && typeof payload === "object" && !Array.isArray(payload), `${stage} response is a JSON object`).toBe(true);
  const data = (payload as { data?: unknown }).data;
  expect(!!data && typeof data === "object" && !Array.isArray(data), `${stage} successful response contains object data`).toBe(true);
  return data as Record<string, unknown>;
}
