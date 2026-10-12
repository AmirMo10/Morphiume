import { useId } from "react";
import { productIntro, type ProductCopy } from "./product-content";

export function ProductIntro({ content }: { content: ProductCopy }) {
  const text = productIntro(content);
  return text?.trim() ? <p className="product-intro plain-copy" dir="auto">{text}</p> : null;
}
export function ProductContentDetails({ content, headingLevel = 2 }: { content: ProductCopy; headingLevel?: 2 | 3 }) {
  const prefix = useId(), Heading = headingLevel === 3 ? "h3" : "h2";
  const sections = [
    { key: "description", title: "توضیح محصول", text: content.shortDescription?.trim() ? content.description : "" },
    { key: "careInstructions", title: "راهنمای نگهداری", text: content.careInstructions },
    { key: "approvedWarnings", title: "نکات و هشدارهای محصول", text: content.approvedWarnings },
  ].filter(section => section.text?.trim());
  return <>{sections.map(section => <section className="notes-section" key={section.key} aria-labelledby={`${prefix}-${section.key}`}><Heading id={`${prefix}-${section.key}`}>{section.title}</Heading><p className="plain-copy" dir="auto">{section.text}</p></section>)}</>;
}
