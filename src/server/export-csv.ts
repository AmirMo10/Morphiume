import "server-only";
import { CommerceError } from "@/contracts/commerce";

// Fail the complete download rather than return a silently truncated catalog.
// This is an operating bound, not a measured export-capacity claim.
export const CSV_MAXIMUM_BYTES = 32 * 1024 * 1024;

export function exportCsv(rows: Iterable<readonly unknown[]>, maximumBytes = CSV_MAXIMUM_BYTES): string {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 3) throw new Error("Invalid CSV byte limit");
  const lines: string[] = [];
  let bytes = 3; // UTF-8 BOM.
  for (const row of rows) {
    const line = row.map(value => {
      let text = String(value ?? "");
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    }).join(",");
    bytes += Buffer.byteLength(line, "utf8") + (lines.length ? 2 : 0);
    if (bytes > maximumBytes) throw new CommerceError("CONFLICT", "حجم فایل از سقف خروجی بیشتر است؛ خروجی کامل تهیه نشد.", 409);
    lines.push(line);
  }
  return "\uFEFF" + lines.join("\r\n");
}
