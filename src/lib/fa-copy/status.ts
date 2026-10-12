/** Persian copy for persisted commerce states. Does not infer success from a browser callback. */
export type StatusContext = "order" | "payment" | "shipment" | "return" | "refund" | "product";

const common: Readonly<Record<string, string>> = {
  draft: "پیش‌نویس",
  published: "منتشرشده",
  archived: "بایگانی‌شده",
  created: "ایجادشده",
  pending: "در انتظار بررسی",
  unknown: "هنوز تأیید نشده",
  succeeded: "تأییدشده",
  paid: "پرداخت‌شده",
  failed: "ناموفق",
  cancelled: "لغوشده",
  canceled: "لغوشده",
  confirmed: "تأییدشده",
  completed: "تکمیل‌شده",
  payment_exception: "نیازمند رسیدگی پس از پرداخت",
  partially_refunded: "بخشی از مبلغ بازپرداخت شده",
  refunded: "بازپرداخت‌شده",
  preparing: "در حال آماده‌سازی",
  processing: "در حال انجام",
  shipped: "ارسال‌شده",
  delivered: "تحویل‌شده",
  requested: "درخواست ثبت‌شده",
  approved: "تأییدشده",
  rejected: "ردشده",
  received: "دریافت‌شده",
  closed: "رسیدگی پایان‌یافته",
  awaiting_payment: "در انتظار پرداخت",
  awaiting_fulfillment: "در انتظار آماده‌سازی",
  reserved: "رزروشده",
  active: "فعال",
  consumed: "استفاده‌شده",
  released: "آزادشده",
};

const contextual: Partial<Record<StatusContext, Readonly<Record<string, string>>>> = {
  payment: { pending: "در انتظار تأیید پرداخت", unknown: "پرداخت هنوز تأیید نشده", succeeded: "پرداخت تأییدشده" },
  refund: { pending: "در انتظار رسیدگی", processing: "در حال انجام بازپرداخت", succeeded: "بازپرداخت ثبت‌شده", failed: "بازپرداخت انجام نشده" },
  return: { pending: "در انتظار رسیدگی", received: "کالا دریافت شده", closed: "رسیدگی پایان‌یافته" },
};

export function statusLabel(value: string, context?: StatusContext): string {
  return (context ? contextual[context]?.[value] : undefined) ?? common[value] ?? "وضعیت نیازمند بررسی";
}

export const orderEventLabels: Readonly<Record<string, string>> = {
  "order.created": "سفارش ثبت شد",
  "payment.succeeded": "پرداخت تأیید شد",
  "payment.failed": "پرداخت انجام نشد",
  "payment.unknown": "پرداخت هنوز تأیید نشده است",
  "payment.verified": "پرداخت تأیید شد",
  "payment.inventory_exception": "پرداخت ثبت شد؛ تأمین سفارش نیازمند رسیدگی است",
  "payment.extra_receipt": "دریافت پرداخت دیگری ثبت شد و نیازمند رسیدگی است",
  "shipment.created": "آماده‌سازی آغاز شد",
  "shipment.shipped": "سفارش ارسال شد",
  "shipment.delivered": "سفارش تحویل شد",
  "request.cancel": "درخواست لغو ثبت شد",
  "request.return": "درخواست مرجوعی ثبت شد",
  "request.approved": "درخواست تأیید شد",
  "request.rejected": "درخواست پذیرفته نشد",
  "request.received": "کالای مرجوعی دریافت شد",
  "request.closed": "رسیدگی به درخواست پایان یافت",
  "refund.pending": "بازپرداخت در انتظار رسیدگی است",
  "refund.completed": "بازپرداخت ثبت شد",
  "reservation.expired": "مهلت رزرو موقت موجودی پایان یافت",
  "inventory.committed": "موجودی سفارش تخصیص یافت",
};

export const roleLabels: Readonly<Record<string, string>> = {
  owner: "مالک فروشگاه",
  product_manager: "مدیر محصولات",
  fulfillment: "مسئول آماده‌سازی و ارسال",
  support: "پشتیبان مشتریان",
  finance: "مسئول مالی",
};

export function receiptDispositionLabel(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    primary: "تخصیص‌یافته به سفارش",
    extra: "دریافت اضافه؛ نیازمند رسیدگی",
    inventory_exception: "پرداخت ثبت‌شده؛ تأمین سفارش نیازمند رسیدگی",
  };
  return labels[value] ?? "دریافت نیازمند بررسی";
}
