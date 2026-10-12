import { customerAuth } from "@/server/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { api, boundedAuthRequest } from "@/server/http";
import { normalizeDigits, normalizePhone } from "@/lib/persian";
import { CommerceError } from "@/contracts/commerce";

const handlers = toNextJsHandler(customerAuth);
export const GET = api(async (request) => {
  const response = await handlers.GET(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
});
export const POST = api(async (request) => {
  const next = await boundedAuthRequest(request, request.nextUrl.pathname.includes("/phone-number/") ? (body) => {
    if (typeof body.phoneNumber === "string") { try { body.phoneNumber = normalizePhone(body.phoneNumber); } catch { throw new CommerceError("VALIDATION","شمارهٔ همراه معتبر نیست."); } }
    if (typeof body.code === "string") body.code = normalizeDigits(body.code);
    return body;
  } : undefined);
  const response = await handlers.POST(next);
  response.headers.set("Cache-Control", "no-store");
  return response;
}, true);
