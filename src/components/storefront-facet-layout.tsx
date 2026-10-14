"use client";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { faNumber } from "./number-format";
import { StorefrontDialog } from "./storefront-dialog";

const subscribeToHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

export function StorefrontFacetLayout({ filters, filterFormId, children, totalItems, activeCount = 0 }: { filters: ReactNode; filterFormId: string; children: ReactNode; totalItems: number; activeCount?: number }) {
  const [open, setOpen] = useState(false);
  const enhanced = useSyncExternalStore(subscribeToHydration, clientHydrated, serverHydrated);
  return <div className={`sf-catalog-layout sf-collection-catalog${enhanced ? " sf-facets-enhanced" : ""}`}><aside className="sf-filter-sidebar" aria-label="فیلتر عطرهای مجموعه">{!open && filters}</aside><div className="sf-catalog-results"><div className="sf-catalog-toolbar"><button type="button" className="secondary sf-filter-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}>فیلترها{activeCount > 0 && ` (${faNumber(activeCount)})`}</button><p className="small muted" role="status">{faNumber(totalItems)} عطر در این مجموعه</p></div>{children}</div><StorefrontDialog open={open} onClose={() => setOpen(false)} title="فیلتر عطرهای مجموعه" className="sf-filter-dialog"><div onClickCapture={event => { if (event.target instanceof Element && event.target.closest("a")) setOpen(false); }}>{open && filters}</div><button type="submit" form={filterFormId} className="button full-width">نمایش نتیجه‌ها ({faNumber(totalItems)})</button></StorefrontDialog></div>;
}
