export function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function normalizePhone(value: string): string {
  let phone = normalizeDigits(value).replace(/[\s()-]/g, "");
  if (phone.startsWith("0098")) phone = `+98${phone.slice(4)}`;
  else if (phone.startsWith("98")) phone = `+${phone}`;
  else if (phone.startsWith("09")) phone = `+98${phone.slice(1)}`;
  else if (/^9\d{9}$/.test(phone)) phone = `+98${phone}`;
  if (!/^\+989\d{9}$/.test(phone)) throw new Error("شمارهٔ همراه معتبر نیست.");
  return phone;
}

export function normalizeSearch(value: string): string {
  return normalizeDigits(value).normalize("NFKC").replace(/ي/g, "ی").replace(/ك/g, "ک")
    .replace(/[\u200c\s]+/g, " ").trim().toLocaleLowerCase("fa-IR");
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium", timeZone: "Asia/Tehran",
  }).format(new Date(value));
}
