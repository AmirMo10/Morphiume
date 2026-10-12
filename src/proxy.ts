import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Exact Next 16.4 accessibility-announcer declarations; arbitrary inline styles stay blocked.
    "style-src-attr 'unsafe-hashes' 'sha256-/3kWSXHts8LrwfemLzY9W0tOv5I4eLIhrf0pT8cU0WI=' 'sha256-2v0wUgRiMnQqfAAERz6WCRNJ9EZeUWOvHSCDVMftC6Q='",
    "img-src 'self' data: blob:", "font-src 'self'", "connect-src 'self'",
    "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'", "frame-src 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-Frame-Options", "DENY");
  if (process.env.DEPLOYMENT_ENV !== "live") response.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (/^\/(api|admin|account|cart|checkout|orders|test)(\/|$)/.test(request.nextUrl.pathname)) response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|assets/|media/).*)"] };
