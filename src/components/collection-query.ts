import type { CollectionPageInput, CollectionProductsPageInput } from "@/contracts/commerce";
import { catalogInput, pageNumber, pageQuery } from "./catalog-query";

export function collectionIndexInput(params: Pick<URLSearchParams, "get">): CollectionPageInput {
  return { page: pageNumber(params.get("page")), pageSize: pageNumber(params.get("pageSize"), 24, 100), search: (params.get("search") ?? "").trim().slice(0, 120) };
}
export function collectionProductsInput(params: Pick<URLSearchParams, "get">): CollectionProductsPageInput {
  const sort = params.get("sort");
  return { ...catalogInput(params), sort: sort === "name" || sort === "price_asc" || sort === "price_desc" ? sort : "position" };
}
export function collectionQuery(input: CollectionPageInput | CollectionProductsPageInput): string {
  return pageQuery({ ...input, page: input.page === 1 ? undefined : input.page, pageSize: input.pageSize === 24 ? undefined : input.pageSize, ...("sort" in input && input.sort === "position" ? { sort: undefined } : {}) });
}
export function collectionParams(values: Record<string, string | string[] | undefined>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, Array.isArray(value) ? value[0] ?? "" : value);
  return query;
}
