type ValidationIssue = {
  code: string;
  message: string;
  path: readonly PropertyKey[];
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
  inclusive?: boolean;
};

const fieldLabels: Readonly<Record<string, string>> = {
  name: "نام", slug: "نامک صفحه", description: "توضیح محصول",
  concentration: "غلظت عطر", family: "خانوادهٔ رایحه",
  imageUrl: "تصویر محصول", variants: "حجم‌های محصول", sku: "شناسهٔ تنوع",
  volumeMl: "حجم", priceToman: "قیمت به تومان", initialStock: "موجودی اولیه",
  recipient: "نام گیرنده", phone: "شمارهٔ همراه", phoneNumber: "شمارهٔ همراه",
  province: "استان", city: "شهر", address: "نشانی", plaque: "پلاک",
  unit: "واحد", postalCode: "کدپستی", quantity: "تعداد",
  code: "کد", couponCode: "کد تخفیف", basisPoints: "درصد تخفیف",
  maxRedemptions: "سقف کل استفاده", maxPerUser: "سقف استفادهٔ هر خریدار",
  expiresAt: "پایان اعتبار", email: "ایمیل", contactPhone: "تلفن تماس",
  title: "عنوان صفحه", body: "متن صفحه", reason: "دلیل",
  carrier: "شرکت ارسال", trackingCode: "کد رهگیری", delta: "تغییر تعداد",
  policyVersion: "نسخهٔ شرایط خرید", shippingDescription: "شرح ارسال",
};

/** Keep approved Persian schema messages; never expose a default English validation sentence. */
export function validationMessage(issue: ValidationIssue): string {
  if (/[\u0600-\u06ff]/.test(issue.message)) return issue.message;
  const key = [...issue.path].reverse().find(part => typeof part === "string");
  const label = typeof key === "string" ? fieldLabels[key] : undefined;
  if (issue.code === "unrecognized_keys") return "درخواست دارای اطلاعات نامعتبر است. فرم را دوباره بررسی کنید.";
  if (key === "postalCode") return "کدپستی ده‌رقمی را وارد کنید.";
  if (key === "phone" || key === "phoneNumber") return "شمارهٔ همراه معتبر ایران را وارد کنید.";
  if (key === "email") return "ایمیل معتبر را وارد کنید.";
  if (key === "expiresAt") return "تاریخ و ساعت پایان اعتبار را بررسی کنید.";
  if (issue.code === "too_small") {
    if (["number", "int", "bigint"].includes(issue.origin ?? "") && issue.minimum !== undefined && label && key !== "basisPoints") {
      const amount = new Intl.NumberFormat("fa-IR").format(issue.minimum);
      return issue.inclusive === false ? `${label} باید بیشتر از ${amount} باشد.` : `${label} باید حداقل ${amount} باشد.`;
    }
    if ((issue.minimum === 1 || issue.minimum === 1n) && issue.origin === "string") return label ? `${label} را وارد کنید.` : "این فیلد را وارد کنید.";
    return label ? `${label} کمتر از حد مجاز است.` : "مقدار واردشده کمتر از حد مجاز است.";
  }
  if (issue.code === "too_big") return label ? `${label} بیش از حد مجاز است.` : "مقدار واردشده بیش از حد مجاز است.";
  if (issue.code === "invalid_type") return label ? `${label} را با قالب درست وارد کنید.` : "قالب این مقدار معتبر نیست.";
  if (issue.code === "invalid_format" || issue.code === "invalid_value") return label ? `${label} معتبر نیست. آن را بررسی کنید.` : "این انتخاب معتبر نیست. دوباره انتخاب کنید.";
  return label ? `${label} را بررسی کنید.` : "این مقدار معتبر نیست. آن را بررسی کنید.";
}
