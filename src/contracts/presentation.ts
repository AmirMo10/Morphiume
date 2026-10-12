export type StoreLink = { label: string; href: string };
export type StoreService = { title: string; description: string; enabled: boolean; link: StoreLink | null };
export type PresentationValue = {
  heroTitle: string | null; heroDescription: string | null; heroAction: StoreLink | null;
  banner: { text: string; link: StoreLink | null } | null;
  headerLinks: StoreLink[]; footerLinks: StoreLink[]; footerText: string | null;
  featuredProductIds: string[]; services: StoreService[];
  maintenance: { enabled: boolean; message: string | null };
};
export type PresentationDto = PresentationValue & { version: number; configured: boolean };
export type PresentationInput = PresentationValue & { expectedVersion: number; reason: string };
export type AdminPresentationDto = PresentationDto & { unavailableLinks: string[]; unavailableProductIds: string[] };
