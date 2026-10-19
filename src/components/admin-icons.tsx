import type { ReactNode } from "react";

export type AdminIconName = "overview" | "products" | "inventory" | "orders" | "shipping" | "collections" | "bulk" | "import" | "customers" | "reports" | "analytics" | "notifications" | "audit" | "content" | "presentation" | "settings" | "coupons" | "arrow" | "refresh" | "menu" | "logout" | "check" | "search" | "plus" | "external";
const paths: Record<AdminIconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  products: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" />,
  inventory: <path d="m3 8 9-5 9 5v13H3V8ZM7 21V11h10v10M7 15h10M7 18h10" />,
  orders: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h6M9 11h6M9 15h3" /></>,
  shipping: <><path d="M3 6h11v11H3V6Zm11 5h4l3 4v2h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  collections: <><rect x="3" y="5" width="7" height="14" rx="1" /><rect x="14" y="5" width="7" height="14" rx="1" /><path d="M6 9h1M17 9h1" /></>,
  bulk: <path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6" />,
  import: <path d="M5 16v5h14v-5M12 3v13m-5-5 5 5 5-5" />,
  customers: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2" /></>,
  reports: <path d="M5 3h10l4 4v14H5V3Zm10 0v5h4M9 17v-4M13 17v-6M16 17v-3" />,
  analytics: <path d="M3 3v18h18M7 15l4-5 4 3 6-8" />,
  notifications: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />,
  audit: <><path d="M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7l-9-4Z" /><path d="m8 12 3 3 5-6" /></>,
  content: <path d="M4 4h16v16H4V4ZM8 8h8M8 12h8M8 16h4" />,
  presentation: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M9 9v11" /></>,
  settings: <><path d="m9 3-1 3-3 1v4l-2 1 2 1v4l3 1 1 3h6l1-3 3-1v-4l2-1-2-1V7l-3-1-1-3H9Z" /><circle cx="12" cy="12" r="3" /></>,
  coupons: <path d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7ZM14 7v3m0 4v5M7 10l3 6" />,
  arrow: <path d="M20 12H4m6-6-6 6 6 6" />,
  refresh: <path d="M20 8a8 8 0 1 0 1 7M20 3v6h-6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  logout: <path d="M10 4H4v16h6M9 12h12m-5-5 5 5-5 5" />,
  check: <path d="m5 12 4 4L19 6" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  external: <><path d="M14 3h7v7m0-7L11 13M10 4H4v16h16v-6" /></>,
};
export function AdminIcon({ name }: { name: AdminIconName }) {
  return <svg className="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
