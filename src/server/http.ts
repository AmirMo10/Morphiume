import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { CommerceError } from "../contracts/commerce";
import { ZodError } from "zod";
import { getConfig } from "./config";
import { validationMessage } from "../lib/fa-copy/validation";
import { finishRequest, withRequestContext } from "./observability";

export function success(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(getConfig().APP_BASE_URL).origin) throw new CommerceError("FORBIDDEN", "این درخواست از مبدأ مجاز ارسال نشده است.", 403);
  const site = request.headers.get("sec-fetch-site");
  if (site && !["same-origin", "none"].includes(site)) throw new CommerceError("FORBIDDEN", "درخواست بین‌سایتی مجاز نیست.", 403);
}

export async function boundedBody(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new CommerceError("VALIDATION","حجم درخواست بیش از حد مجاز است.",413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; length += next.value.byteLength; if (length > limit) { await reader.cancel(); throw new CommerceError("VALIDATION","حجم درخواست بیش از حد مجاز است.",413); } chunks.push(next.value); }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk,offset); offset += chunk.byteLength; }
  return result;
}

export async function boundedAuthRequest(request: NextRequest, transform?: (data: Record<string, unknown>) => Record<string, unknown>): Promise<NextRequest> {
  const bytes = await boundedBody(request, 128000);
  let payload: BodyInit = new Uint8Array(bytes).buffer;
  if (transform) {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new CommerceError("VALIDATION", "قالب درخواست معتبر نیست.");
    payload = JSON.stringify(transform(parsed as Record<string, unknown>));
  }
  const headers = new Headers(request.headers);
  headers.delete("Content-Length");
  return new NextRequest(request.url, { method: request.method, headers, body: payload, signal: request.signal });
}

export function api(handler: (request: NextRequest) => Promise<Response>, mutation = false) {
  return async (request: NextRequest): Promise<Response> => {
    return withRequestContext(request, async () => {
    try {
      if (mutation) assertSameOrigin(request);
      return finishRequest(await handler(request));
    } catch (error) {
      if (error instanceof SyntaxError) return finishRequest(NextResponse.json({ error: { code: "VALIDATION", message: "قالب درخواست معتبر نیست." } }, { status: 400, headers: { "Cache-Control": "no-store" } }), "VALIDATION");
      if (error instanceof CommerceError) return finishRequest(NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers: { "Cache-Control": "no-store" } }), error.code);
      if (error instanceof ZodError) return finishRequest(NextResponse.json({ error: { code: "VALIDATION", message: "اطلاعات فرم را بررسی کنید.", fields: error.issues.map((issue) => ({ path: issue.path.join("."), message: validationMessage(issue) })) } }, { status: 400, headers: { "Cache-Control": "no-store" } }), "VALIDATION");
      return finishRequest(NextResponse.json({ error: { code: "INTERNAL", message: "درخواست انجام نشد. دوباره تلاش کنید." } }, { status: 500, headers: { "Cache-Control": "no-store" } }), "INTERNAL");
    }
    });
  };
}
