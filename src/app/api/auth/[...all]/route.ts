import { customerAuth } from "@/server/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { api } from "@/server/http";
import { normalizeDigits, normalizePhone } from "@/lib/persian";
import { NextRequest } from "next/server";
import { CommerceError } from "@/contracts/commerce";

const handlers = toNextJsHandler(customerAuth);
export const GET = api(async (request) => {
  const response = await handlers.GET(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
});
export const POST = api(async (request) => {
  let next = request;
  if (request.nextUrl.pathname.includes("/phone-number/")) {
    const body = await request.json();
    if (typeof body.phoneNumber === "string") { try { body.phoneNumber = normalizePhone(body.phoneNumber); } catch { throw new CommerceError("VALIDATION","شمارهٔ همراه معتبر نیست."); } }
    if (typeof body.code === "string") body.code = normalizeDigits(body.code);
    next = new NextRequest(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) });
  }
  const response = await handlers.POST(next);
  response.headers.set("Cache-Control", "no-store");
  return response;
}, true);
