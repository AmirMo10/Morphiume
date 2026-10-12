import { createHmac } from "node:crypto";

// Independent RFC 6238/SHA-1 test helper. Not application authentication code.
export function totpForUri(uri: string, time = Date.now()): string {
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error("TOTP fixture URI missing secret");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const letter of secret.toUpperCase().replace(/=+$/, "")) {
    const n = alphabet.indexOf(letter);
    if (n < 0) throw new Error("Invalid Base32 fixture");
    bits += n.toString(2).padStart(5, "0");
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((part) => parseInt(part, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export class TestCookies {
  private readonly values = new Map<string, string>();
  collect(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(";", 1)[0]!;
      const offset = pair.indexOf("=");
      const name = pair.slice(0, offset), value = pair.slice(offset + 1);
      if (/max-age=0(?:;|$)/i.test(line) || !value) this.values.delete(name);
      else this.values.set(name, value);
    }
  }
  header(): string { return [...this.values].map(([key, value]) => `${key}=${value}`).join("; "); }
}
