import Link from "next/link";
import type { PageDto } from "@/contracts/commerce";
import { faNumber } from "./number-format";

export function Pagination({ data, href, onPage, label = "صفحه‌های نتایج" }: { data: Pick<PageDto<unknown>, "page" | "totalPages" | "totalItems">; href?: (page: number) => string; onPage?: (page: number) => void; label?: string }) {
  if (data.totalPages <= 1 && data.page <= 1) return null;
  const last = Math.max(1, data.totalPages);
  const current = Math.min(data.page, last);
  const pages = [...new Set([1, last, current - 1, current, current + 1])].filter(page => page >= 1 && page <= last).sort((a, b) => a - b);
  const control = (page: number, text: string, current = false, relation?: "prev" | "next", visual = text) => href ? <Link className="button secondary" href={href(page)} rel={relation} aria-label={text} aria-current={current ? "page" : undefined}>{visual}</Link> : <button type="button" className="secondary" onClick={() => onPage?.(page)} aria-label={text} aria-current={current ? "page" : undefined}>{visual}</button>;
  return <nav className="pagination" aria-label={label}>
    <p className="small muted">{data.totalPages === 0 ? "این فهرست نتیجه‌ای ندارد." : data.page > data.totalPages ? <>این صفحه در فهرست فعلی وجود ندارد. آخرین صفحه: {faNumber(data.totalPages)}</> : <>صفحهٔ {faNumber(data.page)} از {faNumber(last)} · {faNumber(data.totalItems)} نتیجه</>}</p>
    <div className="pagination-links">{data.page > 1 ? control(Math.min(data.page - 1, last), "صفحهٔ قبل", false, "prev") : <span className="pagination-disabled" aria-disabled="true">صفحهٔ قبل</span>}
      {pages.map((page, index) => <span className="pagination-number" key={page}>{index > 0 && page > pages[index - 1]! + 1 && <span className="pagination-gap" aria-hidden="true">…</span>}{control(page, `صفحهٔ ${faNumber(page)}`, page === data.page, undefined, faNumber(page))}</span>)}
      {data.page < last ? control(data.page + 1, "صفحهٔ بعد", false, "next") : <span className="pagination-disabled" aria-disabled="true">صفحهٔ بعد</span>}
    </div>
  </nav>;
}
