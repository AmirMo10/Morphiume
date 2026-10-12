import type { Metadata } from "next";
import { CollectionIndex } from "@/components/collection-catalog";
import { collectionIndexInput, collectionParams, collectionQuery } from "@/components/collection-query";
import { getCommerce } from "@/server/runtime";
import { getConfig } from "@/server/config";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const input = collectionIndexInput(collectionParams(await searchParams));
  const config = getConfig(), query = collectionQuery(input);
  return { title: "مجموعه‌ها", description: "مجموعه‌های منتشرشدهٔ عطر Morphiume.", alternates: { canonical: new URL(`/collections${query ? "?" + query : ""}`, config.PUBLIC_SITE_URL ?? config.APP_BASE_URL).toString() } };
}
export default async function CollectionsPage({ searchParams }: Props) {
  const input = collectionIndexInput(collectionParams(await searchParams));
  const data = await getCommerce().listCollectionsPage(input);
  return <main id="main" className="page"><CollectionIndex data={data} search={input.search} /></main>;
}
