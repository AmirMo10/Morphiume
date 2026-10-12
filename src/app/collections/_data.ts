import { cache } from "react";
import { notFound } from "next/navigation";
import { CommerceError } from "@/contracts/commerce";
import { getCommerce } from "@/server/runtime";
import { collectionProductsInput } from "@/components/collection-query";

const identity = cache(async (slug: string) => {
  try { return await getCommerce().getCollectionPage(slug, { pageSize: 1 }); }
  catch (error) { if (error instanceof CommerceError && error.code === "NOT_FOUND") notFound(); throw error; }
});
export const readCollection = cache(async (slug: string, query: string) => {
  try { return { detail: await getCommerce().getCollectionPage(slug, collectionProductsInput(new URLSearchParams(query))), error: undefined }; }
  catch (error) {
    if (error instanceof CommerceError && error.code === "NOT_FOUND") notFound();
    if (error instanceof CommerceError && error.code === "VALIDATION") return { detail: await identity(slug), error: error.message };
    throw error;
  }
});
