import type { ProductPageInput } from "@/contracts/commerce";
import { normalizeDigits } from "@/lib/persian";
import { tomanToIrr } from "@/lib/money";

export type PriceRangeFields = Partial<Record<"minPriceToman" | "maxPriceToman", string>>;
export function catalogPriceRange(input: Pick<ProductPageInput, "minPriceToman" | "maxPriceToman">) {
  const fields: PriceRangeFields = {};
  const parse = (key: keyof PriceRangeFields): bigint | undefined => {
    const value = input[key];
    if (value === undefined || !value.trim()) return undefined;
    try { if (value.length > 30) throw new Error(); return tomanToIrr(value); }
    catch { fields[key] = "مبلغ را به تومان، با عدد صحیح نامنفی و در محدودهٔ مجاز وارد کنید."; return undefined; }
  };
  const minimum = parse("minPriceToman"), maximum = parse("maxPriceToman");
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) fields.maxPriceToman = "حداکثر قیمت باید برابر یا بیشتر از حداقل قیمت باشد.";
  return { minimum, maximum, fields, valid: Object.keys(fields).length === 0 };
}

export function pageNumber(value: string | null, fallback = 1, max = 100000): number {
  const number = normalizeDigits(value ?? "").trim();
  return /^\d+$/.test(number) && Number(number) > 0 && Number(number) <= max ? Number(number) : fallback;
}

export function catalogInput(params: Pick<URLSearchParams, "get">): ProductPageInput {
  const sort = params.get("sort");
  const volume = params.get("volume") ?? params.get("volumeMl");
  return { page: pageNumber(params.get("page")), pageSize: pageNumber(params.get("pageSize"), 24, 100), search: (params.get("search") ?? "").slice(0, 120), family: (params.get("family") ?? "").slice(0, 80), concentration: (params.get("concentration") ?? "").slice(0, 80), note: (params.get("note") ?? "").slice(0, 120), ...(params.get("minPriceToman")?.trim() ? { minPriceToman: params.get("minPriceToman")! } : {}), ...(params.get("maxPriceToman")?.trim() ? { maxPriceToman: params.get("maxPriceToman")! } : {}), ...(volume && pageNumber(volume, 0, 5000) ? { volumeMl: pageNumber(volume, 0, 5000) } : {}), available: params.get("stock") === "1" || params.get("available") === "true", sort: sort === "price_asc" || sort === "price_desc" ? sort : "name" };
}

export function pageQuery(input: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== "" && value !== false) params.set(key, String(value));
  return params.toString();
}

export function pageHref(path: string, query: string, page: number): string {
  const params = new URLSearchParams(query);
  if (page === 1) params.delete("page"); else params.set("page", String(page));
  return `${path}${params.size ? "?" + params.toString() : ""}`;
}
