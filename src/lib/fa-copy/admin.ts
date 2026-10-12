const auditActions: Readonly<Record<string, string>> = {
  "product.created": "ساخت محصول",
  "product.updated": "ویرایش محصول",
  "product.published": "انتشار محصول",
  "product.archived": "بایگانی محصول",
  "inventory.adjusted": "اصلاح موجودی",
  "shipment.updated": "ثبت وضعیت ارسال",
  "refund.requested": "درخواست بازپرداخت",
  "refund.completed": "ثبت انجام بازپرداخت",
  "coupon.saved": "ذخیرهٔ تخفیف",
  "content.saved": "ذخیرهٔ محتوا",
  "collection.saved": "ذخیرهٔ مجموعه",
  "return.reviewed": "رسیدگی به لغو یا مرجوعی",
  "settings.updated": "ویرایش تنظیمات فروشگاه",
  "staff.invited": "ساخت حساب مدیر",
  "roles.updated": "تغییر دسترسی مدیر",
  "media.created": "بارگذاری تصویر محصول",
};

const entityTypes: Readonly<Record<string, string>> = {
  product: "محصول", variant: "تنوع محصول", order: "سفارش", refund: "بازپرداخت",
  coupon: "تخفیف", content: "صفحهٔ محتوا", collection: "مجموعه", return: "درخواست رسیدگی",
  setting: "تنظیمات", user: "حساب کاربری", media: "تصویر محصول",
};

const systemReasons: Readonly<Record<string, string>> = {
  "admin form": "ثبت از فرم محصول",
  publish: "انتشار در فروشگاه",
  "admin configuration": "ثبت تنظیمات مدیر",
  "plain text content": "ثبت محتوای صفحه",
  "manual evidence recorded": "ثبت مدرک انجام بازپرداخت دستی",
  "archive retains order history": "بایگانی محصول با حفظ سوابق سفارش",
  shipped: "ثبت ارسال سفارش",
  delivered: "ثبت تحویل سفارش",
  payment_commit: "تخصیص موجودی پس از تأیید پرداخت",
  reservation_expired: "آزادسازی موجودی پس از پایان مهلت رزرو",
};

export function auditActionLabel(value: string): string { return auditActions[value] ?? "عملیات مدیریتی ثبت‌شده"; }
export function entityTypeLabel(value: string): string { return entityTypes[value] ?? "مورد ثبت‌شده"; }
/** User-entered reasons retain their original wording; translate only known system constants. */
export function activityReasonLabel(value: string | null): string { return value ? systemReasons[value] ?? value : "توضیحی ثبت نشده است."; }
