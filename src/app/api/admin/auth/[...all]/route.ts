import { adminAuth } from "@/server/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { api, boundedAuthRequest } from "@/server/http";
import { normalizeDigits } from "@/lib/persian";

const handlers = toNextJsHandler(adminAuth);
export const GET = api(async (request) => {
  const response = await handlers.GET(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
});
export const POST = api(async (request) => {
  const next = await boundedAuthRequest(request, request.nextUrl.pathname.endsWith("/verify-totp") ? (body) => {
    if (typeof body.code === "string") body.code = normalizeDigits(body.code);
    return body;
  } : undefined);
  const response = await handlers.POST(next);
  response.headers.set("Cache-Control", "no-store");
  return response;
}, true);
