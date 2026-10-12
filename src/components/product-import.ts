import type { ProductInput } from "@/contracts/commerce";
import { normalizeDigits } from "@/lib/persian";
import { faNumber } from "./number-format";
import { productContentFields, validateProductContent, type ProductContentDraft } from "./product-content";

export const requiredProductImportColumns = ["name", "slug", "description", "concentration", "family", "imageUrl", "sku", "volumeMl", "priceToman", "initialStock", "topNotes", "heartNotes", "baseNotes"];
export const productImportColumns = [...requiredProductImportColumns, ...productContentFields.map(field => field.key)];
function csvRows(source: string): string[][] {
  const result: string[][] = []; let row: string[] = [], value = "", quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    if (character === '"') { if (quoted && source[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted; }
    else if (character === "," && !quoted) { row.push(value); value = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && source[index + 1] === "\n") index++; row.push(value); if (row.some(cell => cell.trim())) result.push(row); row = []; value = ""; }
    else value += character;
  }
  if (quoted) throw new Error("نقل‌قول در فایل CSV بسته نشده است.");
  row.push(value); if (row.some(cell => cell.trim())) result.push(row); return result;
}
export function productsFromCsv(source: string): ProductInput[] {
  const rows = csvRows(source.replace(/^\uFEFF/, "")), header = rows.shift()?.map(value => value.trim());
  if (!header || requiredProductImportColumns.some(column => !header.includes(column)) || header.some(column => !productImportColumns.includes(column)) || new Set(header).size !== header.length) throw new Error("ستون‌های فایل با الگوی ورود محصولات یکسان نیستند. فایل خلاصهٔ خروجی فروشگاه، الگوی ورود نیست.");
  const bySlug = new Map<string, ProductInput>();
  for (const [index, row] of rows.entries()) {
    if (row.length > header.length) throw new Error(`تعداد ستون‌های ردیف ${faNumber(index + 2)} بیشتر از عنوان‌های فایل است؛ ویرگول داخل متن را در نقل‌قول قرار دهید.`);
    const entry = Object.fromEntries(header.map((column, position) => [column, row[position] ?? ""])), content: ProductContentDraft = {};
    for (const { key } of productContentFields) if (header.includes(key)) content[key] = entry[key] ?? "";
    const errors = validateProductContent(content); if (Object.keys(errors).length) throw new Error(`ردیف ${faNumber(index + 2)}: ${Object.values(errors)[0]}`);
    const slug = entry.slug!; let product = bySlug.get(slug);
    if (!product) {
      product = { name: entry.name!, slug, description: entry.description!, ...content, concentration: entry.concentration!, family: entry.family!, imageUrl: entry.imageUrl!, topNotes: entry.topNotes!.split(/[،;|]/).map(note => note.trim()).filter(Boolean), heartNotes: entry.heartNotes!.split(/[،;|]/).map(note => note.trim()).filter(Boolean), baseNotes: entry.baseNotes!.split(/[،;|]/).map(note => note.trim()).filter(Boolean), variants: [] };
      bySlug.set(slug, product);
    } else if (product.name !== entry.name || product.description !== entry.description || product.family !== entry.family || product.concentration !== entry.concentration || (product.imageUrl ?? "") !== entry.imageUrl || productContentFields.some(({ key }) => product![key]?.trim() !== content[key]?.trim())) throw new Error(`اطلاعات محصول در ردیف ${faNumber(index + 2)} با ردیف قبلی همین محصول متفاوت است.`);
    product.variants.push({ sku: entry.sku!, volumeMl: Number(normalizeDigits(entry.volumeMl!)), priceToman: normalizeDigits(entry.priceToman!).replace(/[,٬\s]/g, ""), initialStock: Number(normalizeDigits(entry.initialStock! || "0")) });
  }
  if (!bySlug.size) throw new Error("فایل ردیف محصول ندارد."); return [...bySlug.values()];
}
