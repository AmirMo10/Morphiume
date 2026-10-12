import type { PresentationInput, PresentationValue, StoreLink } from "@/contracts/presentation";

export const internalStoreHref = /^\/(?:products|collections|guide|account|cart|favorites|pages\/[a-z0-9]+(?:-[a-z0-9]+)*|products\/[a-z0-9]+(?:-[a-z0-9]+)*|collections\/[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const optional = (value: string | null) => value?.trim() || null;
const linkValue = (link: StoreLink | null) => link && ({ label: link.label.trim(), href: link.href.trim() });
export function presentationValue(value: PresentationValue): PresentationValue {
  return { heroTitle: optional(value.heroTitle), heroDescription: optional(value.heroDescription), heroAction: linkValue(value.heroAction),
    banner: value.banner && { text: value.banner.text.trim(), link: linkValue(value.banner.link) },
    headerLinks: value.headerLinks.map(link => linkValue(link)!), footerLinks: value.footerLinks.map(link => linkValue(link)!), footerText: optional(value.footerText),
    featuredProductIds: [...value.featuredProductIds], services: value.services.map(service => ({ ...service, title: service.title.trim(), description: service.description.trim(), link: linkValue(service.link) })),
    maintenance: { enabled: value.maintenance.enabled, message: optional(value.maintenance.message) } };
}
export function validatePresentation(input: PresentationInput) {
  const fields: Record<string, string> = {};
  const text = (path: string, value: string | null, maximum: number, required = false) => { if ((required && !value?.trim()) || (value?.length ?? 0) > maximum) fields[path] = `این متن را ${required ? "وارد کنید و " : ""}با حداکثر ${new Intl.NumberFormat("fa-IR").format(maximum)} نویسه بنویسید.`; };
  const link = (path: string, value: StoreLink | null) => { if (!value) return; text(`${path}.label`, value.label, 80, true); if (value.href.length > 190 || !internalStoreHref.test(value.href)) fields[`${path}.href`] = "نشانی یک صفحه از همین فروشگاه را وارد کنید. نشانی بیرونی و بخش‌های اضافی پس از علامت سؤال یا # مجاز نیستند."; };
  text("heroTitle", input.heroTitle, 160); text("heroDescription", input.heroDescription, 1500); text("footerText", input.footerText, 1500); text("maintenance.message", input.maintenance.message, 1000); text("reason", input.reason, 1000, true);
  link("heroAction", input.heroAction);
  if (input.banner) { text("banner.text", input.banner.text, 500, true); link("banner.link", input.banner.link); }
  for (const [path, values, maximum] of [["headerLinks", input.headerLinks, 8], ["footerLinks", input.footerLinks, 12]] as const) { if (values.length > maximum) fields[path] = "تعداد پیوندها از حد مجاز بیشتر است."; values.forEach((value, index) => link(`${path}.${index}`, value)); }
  if (input.services.length > 4) fields.services = "حداکثر چهار خدمت قابل تنظیم است.";
  input.services.forEach((service, index) => { text(`services.${index}.title`, service.title, 120, true); text(`services.${index}.description`, service.description, 1000, true); link(`services.${index}.link`, service.link); });
  if (input.featuredProductIds.length > 12 || new Set(input.featuredProductIds).size !== input.featuredProductIds.length || input.featuredProductIds.some(id => !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))) fields.featuredProductIds = "حداکثر دوازده محصول با شناسهٔ معتبر و بدون تکرار انتخاب کنید.";
  return fields;
}
export function moveSelection<T>(values: T[], index: number, offset: -1 | 1) { const result = [...values]; const target = index + offset; if (index < 0 || index >= result.length || target < 0 || target >= result.length) return result; [result[index], result[target]] = [result[target]!, result[index]!]; return result; }
