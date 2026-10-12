import type { ProductDto, ProductInput } from "@/contracts/commerce";

export const productContentFields = [
  { key: "shortDescription", label: "توضیح کوتاه", maximum: 600 },
  { key: "careInstructions", label: "راهنمای نگهداری", maximum: 4000 },
  { key: "approvedWarnings", label: "نکات و هشدارهای محصول", maximum: 4000 },
] as const;
export type ProductContentKey = typeof productContentFields[number]["key"];
export type ProductContentDraft = Pick<ProductInput, ProductContentKey>;
export type ProductCopy = Pick<ProductDto, "description"> & Partial<Pick<ProductDto, ProductContentKey>>;
/** Missing legacy response properties stay omitted; explicit server blanks remain authoritative. */
export function productContentDraft(source: Partial<Pick<ProductDto, ProductContentKey>>, fallback: ProductContentDraft = {}): ProductContentDraft {
  const values: ProductContentDraft = {};
  for (const { key } of productContentFields) { if (typeof source[key] === "string") values[key] = source[key]; else if (typeof fallback[key] === "string") values[key] = fallback[key]; }
  return values;
}
export function productIntro(content: ProductCopy) { return content.shortDescription?.trim() ? content.shortDescription : content.description; }
export function validateProductContent(content: ProductContentDraft) {
  const fields: Record<string, string> = {};
  for (const { key, maximum, label } of productContentFields) if (content[key] !== undefined && (typeof content[key] !== "string" || content[key].length > maximum)) fields[key] = `${label} را با حداکثر ${new Intl.NumberFormat("fa-IR").format(maximum)} نویسه بنویسید.`;
  return fields;
}
