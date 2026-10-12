import { HomePresentation } from "@/components/home-presentation";
import { getCommerce } from "@/server/runtime";
import { readPresentation } from "./_presentation";

export default async function HomePage() {
  const presentation = await readPresentation();
  const commerce = getCommerce();
  const resolved = presentation.configured && presentation.featuredProductIds.length ? await commerce.resolvePublishedProducts(presentation.featuredProductIds) : null;
  const products = !presentation.configured ? (await commerce.listProductsPage({ page: 1, pageSize: 4, sort: "name" })).items : presentation.featuredProductIds.flatMap(id => resolved?.products.find(product => product.id === id) ?? []);
  return <HomePresentation presentation={presentation} products={products} />;
}
