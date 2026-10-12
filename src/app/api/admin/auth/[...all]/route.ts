import { adminAuth } from "@/server/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { api } from "@/server/http";
import { normalizeDigits } from "@/lib/persian";
import { NextRequest } from "next/server";

const handlers = toNextJsHandler(adminAuth);
export const GET = api(async (request) => {
  const response = await handlers.GET(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
});
export const POST = api(async (request) => {
  let next = request;
  if (request.nextUrl.pathname.endsWith("/verify-totp")) {
    const body = await request.json();
    if (typeof body.code === "string") body.code = normalizeDigits(body.code);
    next = new NextRequest(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) });
  }
  const response = await handlers.POST(next);
  response.headers.set("Cache-Control", "no-store");
  return response;
}, true);
