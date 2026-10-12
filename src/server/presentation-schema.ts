import { z } from "zod";
import type { PresentationValue } from "../contracts/presentation";

// Navigation is internal and points only to supported storefront routes.
// There is no script/HTML/external-URL slot in these editable plain-text fields.
export const storeHref = z.string().max(190).regex(/^\/(?:products|collections|guide|account|cart|favorites|pages\/[a-z0-9]+(?:-[a-z0-9]+)*|products\/[a-z0-9]+(?:-[a-z0-9]+)*|collections\/[a-z0-9]+(?:-[a-z0-9]+)*)$/);
const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();
const link = z.object({ label: z.string().trim().min(1).max(80), href: storeHref }).strict();
export const presentationValue = z.object({
  heroTitle: nullableText(160), heroDescription: nullableText(1500), heroAction: link.nullable(),
  banner: z.object({ text:z.string().trim().min(1).max(500), link:link.nullable() }).strict().nullable(),
  headerLinks:z.array(link).max(8), footerLinks:z.array(link).max(12), footerText:nullableText(1500),
  featuredProductIds:z.array(z.uuid().transform(id=>id.toLowerCase())).max(12).refine(ids=>new Set(ids).size===ids.length),
  services:z.array(z.object({title:z.string().trim().min(1).max(120),description:z.string().trim().min(1).max(1000),enabled:z.boolean(),link:link.nullable()}).strict()).max(4),
  maintenance:z.object({enabled:z.boolean(),message:nullableText(1000)}).strict(),
}).strict();
export const presentationInput = presentationValue.extend({ expectedVersion:z.number().int().positive().max(2147483646),reason:z.string().trim().min(1).max(1000) }).strict();
export const defaultPresentation: PresentationValue = {
  heroTitle:null,heroDescription:null,heroAction:null,banner:null,
  headerLinks:[{label:"عطرها",href:"/products"},{label:"مجموعه‌ها",href:"/collections"},{label:"راهنمای رایحه",href:"/guide"}],
  footerLinks:[{label:"پیگیری سفارش",href:"/account"}],footerText:null,featuredProductIds:[],services:[],
  maintenance:{enabled:false,message:null},
};
