"use client";
import { useEffect, useState } from "react";
import { api, ApiError, Empty, errorMessage, Loading, Notice } from "./commerce-client";
export type PublishedContent = { slug: string; title: string; body: string; version: number };
export function ContentPage({ slug, title, initialContent }: { slug: string; title: string; initialContent?: PublishedContent | null }) {
  const [content, setContent] = useState<PublishedContent | null>(initialContent ?? null);
  const [loading, setLoading] = useState(initialContent === undefined);
  const [error, setError] = useState("");
  useEffect(() => { if (initialContent !== undefined) return; api<PublishedContent>(`/api/content/${encodeURIComponent(slug)}`).then(setContent).catch(e => { if (!(e instanceof ApiError && e.status === 404)) setError(errorMessage(e)); }).finally(() => setLoading(false)); }, [slug, initialContent]);
  return <article className="article"><p className="eyebrow">Morphiume</p><h1>{content?.title ?? title}</h1>{loading ? <Loading /> : error ? <Notice error>{error}</Notice> : content ? <div className="article-content">{content.body}</div> : <Empty title="محتوای تأییدشده هنوز منتشر نشده است."><p>اطلاعات این صفحه پس از تأیید و انتشار توسط فروشگاه نمایش داده می‌شود.</p></Empty>}</article>;
}
