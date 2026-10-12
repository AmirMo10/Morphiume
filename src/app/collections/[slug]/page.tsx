import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { permanentRedirect } from "next/navigation";
import { CollectionCatalog } from "@/components/collection-catalog";
import { collectionParams, collectionProductsInput, collectionQuery } from "@/components/collection-query";
import { JsonLd } from "@/components/structured-data";
import { getConfig } from "@/server/config";
import { readCollection } from "../_data";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params, input = collectionProductsInput(collectionParams(await searchParams)), query = collectionQuery(input);
  const { detail, error } = await readCollection(slug, query), config = getConfig();
  return { title: detail.collection.name, description: detail.collection.description.slice(0, 180), alternates: { canonical: new URL(`/collections/${detail.canonicalSlug}${!error && query ? "?" + query : ""}`, config.PUBLIC_SITE_URL ?? config.APP_BASE_URL).toString() } };
}
export default async function CollectionPage({ params, searchParams }: Props) {
  const { slug } = await params, input = collectionProductsInput(collectionParams(await searchParams)), query = collectionQuery(input);
  const { detail, error } = await readCollection(slug, query);
  if (detail.redirect && !error) permanentRedirect(`/collections/${detail.canonicalSlug}${query ? "?" + query : ""}`);
  const config = getConfig(), base = config.PUBLIC_SITE_URL ?? config.APP_BASE_URL, nonce = (await headers()).get("x-nonce") ?? undefined;
  const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "مجموعه‌ها", item: new URL("/collections", base).toString() }, { "@type": "ListItem", position: 2, name: detail.collection.name, item: new URL(`/collections/${detail.canonicalSlug}`, base).toString() }] };
  return <main id="main" className="page"><nav className="breadcrumbs" aria-label="مسیر صفحه"><Link href="/collections">مجموعه‌ها</Link><span aria-hidden="true">/</span><span aria-current="page"><bdi>{detail.collection.name}</bdi></span></nav><h1><bdi>{detail.collection.name}</bdi></h1>{detail.collection.description && <p className="muted collection-description" dir="auto">{detail.collection.description}</p>}<CollectionCatalog detail={detail} input={input} error={error} /><JsonLd data={breadcrumb} nonce={nonce} /></main>;
}
