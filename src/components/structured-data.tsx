// Escape script delimiters while preserving the original values after JSON.parse.
export function serializeJsonLd(data: unknown): string {
  const json = JSON.stringify(data);
  if (json === undefined) throw new Error("Structured data must be JSON serializable.");
  return json.replace(/[<>&\u2028\u2029]/g, character => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
}

export function JsonLd({ data, nonce }: { data: unknown; nonce?: string }) {
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
