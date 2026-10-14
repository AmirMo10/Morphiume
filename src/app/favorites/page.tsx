import { WishlistContent } from "@/components/wishlist";
export const metadata = { title: "علاقه‌مندی‌ها", robots: { index: false, follow: false } };
export default function FavoritesPage() { return <main id="main" className="page"><div className="page-heading"><p className="eyebrow">برای بازگشت به انتخاب‌های شما</p><h1>علاقه‌مندی‌ها</h1><p className="muted">عطرهای ذخیره‌شده را کنار هم ببینید و دوباره بررسی کنید.</p></div><WishlistContent /></main>; }
