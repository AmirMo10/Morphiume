import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CommerceError, type Actor, type OrderDto, type Role } from "@/contracts/commerce";
import { randomUUID } from "node:crypto";
import { api, success, boundedBody } from "@/server/http";
import { getCommerce, getMockPayments } from "@/server/runtime";
import { adminActor, adminSession, customerActor } from "@/server/auth/actors";
import { pool } from "@/server/db";
import { getConfig } from "@/server/config";
import { readMockOtp } from "@/server/auth/otp";
import { getSettings, saveSettings, adminDirectory } from "@/server/admin";
import { uploadMedia } from "@/server/media";
import { getShippingSettings, saveShippingSettings } from "@/server/shipping";
import { recordCommerceResponse } from "@/server/observability";
import { getPresentation, getAdminPresentation, savePresentation } from "@/server/presentation";
import { exportCsv } from "@/server/export-csv";

export const runtime = "nodejs";
const id = z.uuid();
const version = z.number().int().positive();
const address = z.object({ recipient: z.string().min(1).max(120), phone: z.string().max(40), province: z.string().min(1).max(80), city: z.string().min(1).max(80), address: z.string().min(1).max(1000), plaque: z.string().min(1).max(20), unit: z.string().max(20).optional(), postalCode: z.string().max(20) }).strict();
const productImage = z.object({url:z.string().max(128),alt:z.string().max(240),variantSku:z.string().max(64).nullable().optional()}).strict();
const product = z.object({ name: z.string().min(1).max(160), slug: z.string().max(160), description: z.string().max(10000), shortDescription:z.string().trim().max(600).optional(), careInstructions:z.string().trim().max(4000).optional(), approvedWarnings:z.string().trim().max(4000).optional(), concentration: z.string().max(80), family: z.string().max(80), topNotes: z.array(z.string().max(120)).max(30), heartNotes: z.array(z.string().max(120)).max(30), baseNotes: z.array(z.string().max(120)).max(30), imageUrl: z.string().max(500).optional(), images:z.array(productImage).max(10).optional(), variants: z.array(z.object({ sku: z.string().max(64), volumeMl: z.number().int().positive().max(5000), priceToman: z.string().max(20), initialStock: z.number().int().min(0).max(100000).optional() }).strict()).min(1).max(20) }).strict();
const paging=z.object({page:z.coerce.number().int().positive().max(100000).optional(),pageSize:z.coerce.number().int().positive().max(100).optional()});
const productPage=paging.extend({search:z.string().max(120).optional(),family:z.string().max(80).optional(),concentration:z.string().max(80).optional(),note:z.string().max(120).optional(),minPriceToman:z.string().max(30).optional(),maxPriceToman:z.string().max(30).optional(),volumeMl:z.coerce.number().int().positive().max(5000).optional(),available:z.enum(["true","false"]).transform(value=>value==="true").optional(),sort:z.enum(["name","price_asc","price_desc"]).optional()}).strict();
const orderPage=paging.extend({search:z.string().max(100).optional(),status:z.enum(["awaiting_payment","confirmed","payment_exception","cancelled","completed"]).optional(),paymentStatus:z.enum(["pending","paid","partially_refunded","refunded","failed","unknown"]).optional()}).strict();
const collectionIndexPage=paging.extend({search:z.string().max(120).optional()}).strict();
const adminCollectionIndexPage=collectionIndexPage.extend({published:z.enum(["true","false"]).transform(value=>value==="true").optional()});
const collectionProductsPage=productPage.extend({sort:z.enum(["position","name","price_asc","price_desc"]).optional()});
function pageQuery(request:NextRequest,keys:string[]) {
  return Object.fromEntries(keys.filter(key=>request.nextUrl.searchParams.has(key)).map(key=>[key,request.nextUrl.searchParams.get(key)]));
}
const productPageKeys=["page","pageSize","search","family","concentration","note","minPriceToman","maxPriceToman","volumeMl","available","sort"];
const orderPageKeys=["page","pageSize","search","status","paymentStatus"];
const checkout = z.object({ cartId: id, cartVersion: version, address, shippingMethodId: z.literal("standard"), quoteFingerprint: z.string().min(1).max(200), policyVersion: z.string().max(100) }).strict();
async function body(request: NextRequest, limit=128000) {
  const raw = new TextDecoder().decode(await boundedBody(request,limit));
  return JSON.parse(raw || "{}");
}
function key(request: NextRequest) { return z.string().min(8).max(128).parse(request.headers.get("Idempotency-Key")); }
function missing(): never { throw new CommerceError("NOT_FOUND", "این بخش پیدا نشد.", 404); }
type CartState = { cart: Awaited<ReturnType<ReturnType<typeof getCommerce>["getCart"]>>; token: string; fresh: boolean; actor?: Actor };
function cookieCart(request: NextRequest) {
  const parts = request.cookies.get("morphiume-cart")?.value.split(".") ?? [];
  const [cartId, token] = parts;
  return parts.length === 2 && id.safeParse(cartId).success && token && /^[A-Za-z0-9_-]{40,60}$/.test(token) ? { cartId: cartId!, token } : undefined;
}
async function existingCartFor(request: NextRequest, cartId: string): Promise<CartState> {
  const proof = cookieCart(request);
  if (!proof || proof.cartId !== cartId) throw new CommerceError("CONFLICT", "سبد تغییر کرده است. نسخهٔ تازه را بررسی کنید.", 409);
  const actor = await customerActor(request.headers, true);
  return { cart: await getCommerce().getCart(cartId, proof.token, actor), token: proof.token, actor, fresh: false };
}
async function cartFor(request: NextRequest): Promise<CartState> {
  const commerce = getCommerce();
  const actor = await customerActor(request.headers, true);
  const proof = cookieCart(request);
  if (proof) {
    try { return { cart: await commerce.getCart(proof.cartId, proof.token, actor), token: proof.token, actor, fresh: false }; }
    catch (error) { if (!(error instanceof CommerceError) || ![401,403,404].includes(error.status)) throw error; }
  }
  const created = await commerce.createCart();
  return { ...created, token: created.guestToken, actor, fresh: true };
}
function cartResponse(data: unknown, state: CartState) {
  const response = success(data);
  if (state.fresh) response.cookies.set("morphiume-cart", `${state.cart.id}.${state.token}`, { httpOnly: true, sameSite: "lax", secure: new URL(getConfig().APP_BASE_URL).protocol === "https:", path: "/", maxAge: 30*86400 });
  return response;
}
const couponDto = (row: Record<string, unknown>) => ({ id: row.code, code: row.code, basisPoints: row.basis_points, maxRedemptions: row.usage_limit, maxPerUser: row.per_user_limit, minimumIrr: row.minimum_irr, expiresAt: row.expires_at, enabled: row.active, version: row.version });
const contentDto = (row: Record<string, unknown>) => ({ id: row.slug, slug: row.slug, title: row.title, body: row.body, published: row.status === "published", version: row.version });
function orderView(order:OrderDto,roles:Role[]) {
  const financialVisible = roles.some(role=>["owner","finance","support"].includes(role));
  if(financialVisible) return {...order,financialVisible};
  const view:Record<string,unknown> = {...order,financialVisible,refunds:[],items:order.items.map(item=>({name:item.name,sku:item.sku,volumeMl:item.volumeMl,quantity:item.quantity})),events:order.events.filter(event=>!event.type.startsWith("refund.") && !event.type.startsWith("payment."))};
  for(const key of ["subtotal","discount","shipping","tax","total","policyVersion"]) delete view[key];
  return view;
}
function csv(rows:unknown[][]) {
  return new Response(exportCsv(rows),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=morphiume-export.csv","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}

async function dispatch(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.pathname.slice(5).split("/").map(decodeURIComponent);
  const route = path.join("/");
  const method = request.method;
  const commerce = getCommerce();
  if (route === "health/live" && method === "GET") return success({ status: "alive", environment: getConfig().DEPLOYMENT_ENV });
  if (route === "health/ready" && method === "GET") { await pool.query("SELECT 1"); return success({ status: "ready" }); }
  if (route === "catalog/page" && method === "GET") return success(await commerce.listProductsPage(productPage.parse(pageQuery(request,productPageKeys))));
  if (route === "catalog/resolve" && method === "GET") {
    const raw=z.string().max(37000).parse(request.nextUrl.searchParams.get("ids") ?? "");
    const ids=z.array(id).max(100).parse(raw ? raw.split(",").map(value=>value.trim().toLowerCase()) : []);
    return success(await commerce.resolvePublishedProducts(ids));
  }
  if (route === "products" && method === "GET") return success(await commerce.listProducts({ search: request.nextUrl.searchParams.get("search") ?? undefined, family: request.nextUrl.searchParams.get("family") ?? undefined, available: request.nextUrl.searchParams.get("available") === "true" }));
  if (path[0] === "products" && path.length === 2 && method === "GET") return success(await commerce.getProduct(path[1]!));
  if (route === "settings" && method === "GET") return success(await getSettings());
  if (route === "shipping" && method === "GET") return success(await getShippingSettings());
  if (route === "presentation" && method === "GET") return success(await getPresentation());
  if (path[0] === "content" && path.length === 2 && method === "GET") { const pages = await commerce.listContent(); const page = pages.find(row => row.slug === path[1]); return success(page ? contentDto(page) : missing()); }
  if (route === "collections" && method === "GET") return success(await commerce.listCollections());
  if (route === "collections/page" && method === "GET") return success(await commerce.listCollectionsPage(collectionIndexPage.parse(pageQuery(request,["page","pageSize","search"]))));
  if (path[0] === "collections" && path.length === 3 && path[2] === "page" && method === "GET") return success(await commerce.getCollectionPage(z.string().min(1).max(160).parse(path[1]),collectionProductsPage.parse(pageQuery(request,productPageKeys))));
  if (route === "cart/claim" && method === "POST") {
    const actor = (await customerActor(request.headers))!;
    const input = z.object({ cartId: id, expectedVersion: version }).strict().parse(await body(request));
    const proof = cookieCart(request);
    if (!proof || proof.cartId !== input.cartId) throw new CommerceError("CONFLICT", "سبد تغییر کرده است. نسخهٔ تازه را بررسی کنید.", 409);
    return success(await commerce.claimCart(actor, input.cartId, proof.token, input.expectedVersion));
  }
  if (route === "cart" || route === "cart/items" || route === "cart/coupon") {
    const methods = route === "cart" ? ["GET", "POST", "PATCH"] : route === "cart/items" ? ["POST", "PUT", "DELETE"] : ["POST", "PATCH", "DELETE"];
    if (!methods.includes(method)) return missing();
    if (method === "GET") { const state = await cartFor(request); return cartResponse(state.cart, state); }
    const input = await body(request);
    if ((route === "cart" && method === "POST") || (route === "cart/items" && ["POST","PUT","DELETE"].includes(method))) {
      const fields = z.object({ variantId: id, quantity: z.number().int().min(0).max(20).optional(), cartId: id.optional(), expectedVersion: version.optional() }).strict();
      const item = (method === "POST" ? fields.refine(value => (value.cartId === undefined) === (value.expectedVersion === undefined)) : fields.extend({ cartId: id, expectedVersion: version })).parse(input);
      const state = item.cartId ? await existingCartFor(request, item.cartId) : await cartFor(request);
      const prior = state.cart.items.find(row => row.variantId === item.variantId)?.quantity ?? 0;
      const quantity = method === "DELETE" ? 0 : method === "POST" ? prior + (item.quantity ?? 1) : (item.quantity ?? 0);
      return cartResponse(await commerce.setCartItem(state.cart.id, state.token, item.variantId, quantity, item.expectedVersion ?? state.cart.version, state.actor), state);
    }
    if ((route === "cart" && method === "PATCH") || route === "cart/coupon") {
      const data = z.object({ cartId: id, expectedVersion: version, couponCode: z.string().max(40).nullable().optional(), code: z.string().max(40).optional() }).strict().parse(input);
      const state = await existingCartFor(request, data.cartId);
      return cartResponse(await commerce.setCartCoupon(state.cart.id, state.token, method === "DELETE" ? null : data.couponCode ?? data.code ?? null, data.expectedVersion, state.actor), state);
    }
    return missing();
  }
  if (route === "checkout/quote" && method === "POST") {
    const actor = (await customerActor(request.headers))!;
    const input = z.object({ cartId: id, cartVersion: version, address: address.optional(), shippingMethodId: z.literal("standard").optional() }).strict().parse(await body(request));
    const state = await cartFor(request);
    if (state.cart.id !== input.cartId || state.cart.version !== input.cartVersion) throw new CommerceError("CONFLICT", "سبد تغییر کرده است. مبلغ را دوباره بررسی کنید.", 409);
    return success(await commerce.quoteCheckout(actor, state.token, input.cartId));
  }
  if (route === "checkout" && method === "POST") {
    const actor = (await customerActor(request.headers))!;
    const input = checkout.parse(await body(request));
    const proof = cookieCart(request);
    const result = await commerce.createCheckout(actor, proof?.cartId === input.cartId ? proof.token : "", input, key(request));
    recordCommerceResponse("checkout.response", { orderId: result.orderId, paymentAttemptId: result.paymentAttemptId, outcome: result.paymentStatus });
    return success(result, 201);
  }
  if (path[0] === "orders") {
    const actor = (await customerActor(request.headers))!;
    if(route === "orders/page" && method === "GET") return success(await commerce.listOrdersPage(actor,orderPage.parse(pageQuery(request,orderPageKeys))));
    if (path.length === 1 && method === "GET") return success(await commerce.listOrders(actor));
    if (path.length === 2 && method === "GET") { const order = await commerce.getOrder(actor, path[1]!); recordCommerceResponse("order.response", { orderId: order.id, outcome: order.status }); return success(order); }
    if (path[2] === "retry-payment" && method === "POST") { const result = await commerce.retryPayment(actor, id.parse(path[1]), key(request)); recordCommerceResponse("checkout.response", { orderId: result.orderId, paymentAttemptId: result.paymentAttemptId, outcome: result.paymentStatus }); return success(result); }
    if (path[2] === "returns" && method === "POST") { const data = z.object({ kind: z.enum(["cancel","return"]), reason: z.string().min(1).max(1000) }).strict().parse(await body(request)); return success(await commerce.requestReturn(actor, id.parse(path[1]), data.kind, data.reason), 201); }
  }
  if (path[0] === "addresses") {
    const actor = (await customerActor(request.headers))!;
    if (method === "GET" && path.length === 1) return success(await commerce.listAddresses(actor));
    if (method === "POST" && path.length === 1) { const data = address.extend({ id: id.optional() }).strict().parse(await body(request)); return success(await commerce.saveAddress(actor, data, data.id)); }
    if (method === "DELETE" && path.length === 2) { await commerce.deleteAddress(actor, id.parse(path[1])); return success({ deleted: true }); }
  }
  if (route === "wishlist") {
    const actor = (await customerActor(request.headers))!;
    if (method === "GET") return success(await commerce.listWishlist(actor));
    if (method === "POST") { const data = z.object({ productId: id, enabled: z.boolean() }).strict().parse(await body(request)); await commerce.setWishlist(actor, data.productId, data.enabled); return success({ saved: true }); }
  }
  if (path[0] === "notifications") {
    const actor=(await customerActor(request.headers))!;
    if(method === "GET" && path.length === 1) return success((await pool.query("SELECT id,title,body,created_at AS \"createdAt\",read_at AS \"readAt\" FROM notification_message WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[actor.userId])).rows);
    if(method === "PATCH" && path.length === 2) {const updated=await pool.query("UPDATE notification_message SET read_at=coalesce(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id,read_at AS \"readAt\"",[id.parse(path[1]),actor.userId]);if(!updated.rowCount)return missing();return success(updated.rows[0]);}
  }
  if (route === "test/otp" && method === "GET") {
    const config = getConfig();
    const expected = Buffer.from(config.MOCK_CONTROL_SECRET ?? "");
    const received = Buffer.from(request.headers.get("x-morphiume-test-secret") ?? "");
    if (config.DEPLOYMENT_ENV === "live" || !expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) return missing();
    return success({ code: await readMockOtp(request.nextUrl.searchParams.get("phone") ?? "") });
  }
  if (path[0] === "test" && path[1] === "payments" && path.length === 3) {
    const actor = (await customerActor(request.headers))!;
    const authority = z.string().regex(/^MOCK-[a-f0-9-]{36}$/).parse(path[2]);
    const mock = getMockPayments();
    const result = await pool.query("SELECT p.order_id,p.amount_irr::text,p.status FROM payment_attempt p JOIN orders o ON o.id=p.order_id WHERE p.authority=$1 AND p.provider='mock' AND o.user_id=$2", [authority, actor.userId]);
    const attempt = result.rows[0]; if (!attempt) return missing();
    if (method === "GET") return success({ authority, orderId: attempt.order_id, total: { amountIrr: attempt.amount_irr, currency: "IRR" }, status: attempt.status });
    if (method === "POST") { const data = z.object({ outcome: z.enum(["succeeded","failed","unknown"]) }).strict().parse(await body(request)); await mock.complete(authority, data.outcome === "succeeded" ? "paid" : data.outcome === "failed" ? "failed" : "timeout"); const result = await commerce.verifyPayment(authority); recordCommerceResponse("payment.verification.response", { orderId: result.orderId, outcome: result.status }); return success({ orderId: result.orderId, paymentStatus: result.status, redirectUrl: `/orders/${result.orderId}` }); }
  }
  if (path[0] === "payments" && path[2] === "callback" && method === "GET") {
    if (path[1] !== getConfig().PAYMENT_PROVIDER) return missing();
    const authority = z.string().min(10).max(120).parse(request.nextUrl.searchParams.get("Authority"));
    const result = await commerce.verifyPayment(authority);
    recordCommerceResponse("payment.verification.response", { orderId: result.orderId, outcome: result.status });
    return NextResponse.redirect(new URL(`/orders/${result.orderId}`, getConfig().APP_BASE_URL), 303);
  }
  if (route === "admin/session" && method === "GET") { const state = await adminSession(request.headers); return success({user:state.user,role:state.role,roles:state.roles,permissions:state.permissions,mfaRequired:state.mfaRequired,mfaVerified:state.mfaVerified}); }
  if (path[0] === "admin") {
    if (route === "admin/presentation") {
      const actor=await adminActor(request.headers,"content.write");
      if (method === "GET") return success(await getAdminPresentation(actor));
      if (method === "PUT") return success(await savePresentation(actor,await body(request)));
    }
    if (route === "admin/collections/page" && method === "GET") return success(await commerce.listAdminCollectionsPage(await adminActor(request.headers,"catalog.write"),adminCollectionIndexPage.parse(pageQuery(request,["page","pageSize","search","published"]))));
    if (path[1] === "collections" && path.length === 3 && method === "GET") return success(await commerce.getAdminCollection(await adminActor(request.headers,"catalog.write"),id.parse(path[2])));
    if(route === "admin/variants/page" && method === "GET") return success(await commerce.listVariantsPage(await adminActor(request.headers),paging.extend({search:z.string().max(120).optional()}).strict().parse(pageQuery(request,["page","pageSize","search"]))));
    if(route === "admin/shipping") {
      const actor=await adminActor(request.headers,"refunds.write",method!=="GET");
      if(method==="GET") return success(await getShippingSettings());
      if(method==="PUT") return success(await saveShippingSettings(actor,await body(request)));
      return missing();
    }
    if(route === "admin/test-otp" && method === "GET") {await adminActor(request.headers,"roles.write",true);if(getConfig().DEPLOYMENT_ENV === "live")return missing();return success({code:await readMockOtp(request.nextUrl.searchParams.get("phone")??"")});}
    if(route === "admin/export" && method === "GET") {
      const kind=request.nextUrl.searchParams.get("kind");
      if(kind === "products") {const actor=await adminActor(request.headers,"catalog.write",true);const products=await commerce.listExportProducts(actor);return csv([["نام","نامک","شناسهٔ تنوع","حجم میلی‌لیتر","قیمت تومان","موجودی قابل فروش","وضعیت","توضیح کوتاه","روش نگه‌داری","هشدارهای فروشنده"],...products.flatMap(p=>p.variants.map(v=>[p.name,p.slug,v.sku,v.volumeMl,(BigInt(v.price.amountIrr)/10n).toString(),v.available,p.status,p.shortDescription,p.careInstructions,p.approvedWarnings]))]);}
      if(kind === "orders") {const actor=await adminActor(request.headers,"orders.read",true);const orders=await commerce.listExportOrders(actor);return csv([["شمارهٔ سفارش","تاریخ","وضعیت","وضعیت پرداخت","وضعیت ارسال"],...orders.map(o=>[o.orderNumber,o.createdAt,o.status,o.paymentStatus,o.shipment?.status??""])]);}
      return missing();
    }
    if (route === "admin/media" && method === "POST") return success(await uploadMedia(request, await adminActor(request.headers,"catalog.write")), 201);
    if (route === "admin/bulk" && method === "POST") {
      const actor=await adminActor(request.headers);
      const data=z.object({operations:z.array(z.object({variantId:id,expectedProductVersion:version,priceToman:z.string().max(20).optional(),inventoryDelta:z.number().int().min(-100000).max(100000).optional()}).strict()).min(1).max(100),reason:z.string().trim().min(1).max(1000),operationKey:z.string().min(8).max(128),dryRun:z.boolean()}).strict().parse(await body(request));
      if(!data.dryRun) await adminActor(request.headers,undefined,true);
      const result=await commerce.bulkEdit(actor,data);
      const state=await adminSession(request.headers);
      const financialVisible=state.permissions.includes("catalog.write");
      return success(financialVisible?{...result,financialVisible}:{...result,financialVisible,changes:result.changes.map(change=>({variantId:change.variantId,sku:change.sku,productName:change.productName,currentStock:change.currentStock,nextStock:change.nextStock}))});
    }
    if (route === "admin/settings") { const actor = await adminActor(request.headers,"content.write"); if (method === "GET") return success(await getSettings()); if (method === "PUT") return success(await saveSettings(actor, await body(request))); }
    if (["customers","roles","reports","audit"].includes(path[1]!)) return success(await adminDirectory(request, path, method, method === "GET" ? undefined : await body(request)));
    if (path[1] === "products") {
      const actor = await adminActor(request.headers,"catalog.write");
      if(route === "admin/products/page" && method === "GET") return success(await commerce.listAdminProductsPage(actor,productPage.extend({status:z.enum(["draft","published","archived"]).optional()}).parse(pageQuery(request,[...productPageKeys,"status"]))));
      if (path.length === 2 && method === "GET") return success(await commerce.listAdminProducts(actor));
      if (path.length === 2 && method === "POST") return success(await commerce.createProduct(actor, product.parse(await body(request))), 201);
      if (path.length === 3 && method === "GET") return success(await commerce.getProduct(id.parse(path[2]), actor));
      if (path.length === 3 && method === "PATCH") { const data = product.extend({ expectedVersion: version }).strict().parse(await body(request)); return success(await commerce.updateProduct(actor,id.parse(path[2]),data,data.expectedVersion)); }
      if (path.length === 4 && method === "POST") { const data = z.object({ expectedVersion: version }).strict().parse(await body(request)); if (path[3] === "publish") return success(await commerce.publishProduct(actor,id.parse(path[2]),data.expectedVersion)); if (path[3] === "archive") return success(await commerce.archiveProduct(actor,id.parse(path[2]),data.expectedVersion)); }
    }
    if (path[1] === "import" && method === "POST") { const actor = await adminActor(request.headers,"catalog.write"); const data = z.object({ rows: z.array(product).max(300), dryRun: z.boolean().default(true) }).strict().parse(await body(request,2000000)); return success(await commerce.importProducts(actor,data.rows,data.dryRun)); }
    if (path[1] === "orders") {
      const actor = await adminActor(request.headers,"orders.read");
      const state=await adminSession(request.headers);
      if(route === "admin/orders/page" && method === "GET") {
        const result=await commerce.listOrdersPage(actor,orderPage.parse(pageQuery(request,orderPageKeys)));
        return success({...result,items:result.items.map(order=>orderView(order,state.roles))});
      }
      if (path.length === 2 && method === "GET") return success((await commerce.listOrders(actor)).map(order=>orderView(order,state.roles)));
      const orderId = id.parse(path[2]);
      if (path.length === 3 && method === "GET") return success(orderView(await commerce.getOrder(actor,orderId),state.roles));
      if (path[3] === "notes") {
        await commerce.getOrder(actor,orderId);
        if(method === "GET") return success((await pool.query("SELECT id,actor_id AS \"actorId\",reason,created_at AS \"createdAt\" FROM audit_event WHERE entity_type='order' AND entity_id=$1 AND action='order.note' ORDER BY created_at",[orderId])).rows);
        if(method === "POST") {const data=z.object({reason:z.string().trim().min(1).max(2000)}).strict().parse(await body(request));await pool.query("INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,reason) VALUES($1,$2,'order.note','order',$3,$4)",[randomUUID(),actor.userId,orderId,data.reason]);return success({saved:true},201);}
      }
      if (path[3] === "shipment" && ["PATCH","POST"].includes(method)) {
        const data=z.object({carrier:z.string().min(1).max(120),trackingCode:z.string().min(1).max(160),status:z.enum(["shipped","delivered"])}).strict().parse(await body(request));
        const updated=await commerce.recordShipment(actor,orderId,data);
        const current=await adminSession(request.headers);
        if(!current.mfaVerified || !current.permissions.includes("orders.read")) throw new CommerceError("FORBIDDEN","مجوز مشاهدهٔ سفارش را ندارید.",403);
        recordCommerceResponse("shipment.response", { orderId: updated.id, outcome: updated.shipment?.status });
        return success(orderView(updated,current.roles));
      }
      if (path[3] === "receipts" && method === "GET") return success(await commerce.listReceipts(await adminActor(request.headers,"refunds.write"),orderId));
      if (path[3] === "refunds" && method === "POST") { const data = z.object({ receiptId: id, amountIrr: z.string().max(20), reason: z.string().min(1).max(1000), operationKey: z.string().min(8).max(128) }).strict().parse(await body(request)); return success(await commerce.requestRefund(await adminActor(request.headers,"refunds.write",true),orderId,data.receiptId,data.amountIrr,data.reason,data.operationKey)); }
    }
    if (path[1] === "refunds" && path[3] === "complete" && method === "POST") { const data = z.object({ evidence: z.string().min(10).max(2000) }).strict().parse(await body(request)); return success(await commerce.completeManualRefund(await adminActor(request.headers,"refunds.write",true),id.parse(path[2]),data.evidence)); }
    if (path[1] === "refunds" && path.length === 4 && path[3] === "fail" && method === "POST") { const data = z.object({ outcome:z.literal("confirmed_non_transfer"),reason:z.string().trim().min(1).max(1000),evidence:z.string().trim().min(10).max(1000),operationKey:z.string().min(8).max(128) }).strict().parse(await body(request)); return success(await commerce.failManualRefund(await adminActor(request.headers,"refunds.write",true),id.parse(path[2]),data)); }
    if (path[1] === "returns" && path.length === 3 && method === "PATCH") { const data = z.object({ status: z.enum(["approved","rejected","received","closed"]), reason: z.string().min(1).max(1000), restock: z.boolean().optional() }).strict().parse(await body(request)); return success(await commerce.decideReturn(await adminActor(request.headers,"orders.fulfill"),id.parse(path[2]),data)); }
    if(route === "admin/inventory/ledger" && method === "GET") {
      await adminActor(request.headers,"inventory.write");
      const filter=request.nextUrl.searchParams.get("variantId");
      const rows=await pool.query("SELECT l.id,l.variant_id AS \"variantId\",v.sku,l.on_hand_delta AS delta,l.reserved_delta AS \"reservedDelta\",l.reason,l.created_at AS \"createdAt\" FROM inventory_ledger l JOIN variant v ON v.id=l.variant_id WHERE ($1::uuid IS NULL OR l.variant_id=$1::uuid) ORDER BY l.created_at DESC,l.id DESC LIMIT 200",[filter===null?null:id.parse(filter)]);
      return success(rows.rows);
    }
    if (route === "admin/inventory") {
      const actor = await adminActor(request.headers,"inventory.write");
      if (method === "GET") { const variants = await commerce.listInventory(actor); const ledger = await pool.query("SELECT l.id,l.variant_id,l.on_hand_delta,l.reserved_delta,l.reason,l.created_at FROM inventory_ledger l ORDER BY l.created_at DESC LIMIT 200"); return success({ variants: variants.map(v=>({id:v.variant_id,sku:v.sku,productName:v.name,productVersion:v.product_version,volumeMl:v.volume_ml,onHand:v.on_hand,reserved:v.reserved,available:v.available})), ledger: ledger.rows.map(l=>({id:l.id,variantId:l.variant_id,delta:l.on_hand_delta,reservedDelta:l.reserved_delta,reason:l.reason,createdAt:l.created_at})) }); }
      if (method === "POST") { const data = z.object({ variantId: id, delta: z.number().int().min(-100000).max(100000), reason: z.string().min(1).max(1000), operationKey: z.string().min(8).max(128) }).strict().parse(await body(request)); return success(await commerce.adjustInventory(actor,data.variantId,data.delta,data.reason,data.operationKey)); }
    }
    if (route === "admin/coupons") {
      const actor = await adminActor(request.headers,"content.write");
      if (method === "GET") return success((await commerce.listCoupons(actor)).map(couponDto));
      if (method === "POST") { const data = z.object({ id: z.string().optional(), code: z.string().max(40), basisPoints: z.number().int().min(1).max(10000), maxRedemptions: z.number().int().positive(), maxPerUser: z.number().int().positive(), minimumIrr: z.string().default("0"), expiresAt: z.iso.datetime().optional(), enabled: z.boolean(), expectedVersion: version.optional() }).strict().parse(await body(request)); return success(couponDto(await commerce.saveCoupon(actor,{code:data.code,basisPoints:data.basisPoints,usageLimit:data.maxRedemptions,perUserLimit:data.maxPerUser,minimumIrr:data.minimumIrr,expiresAt:data.expiresAt ?? new Date(Date.now()+30*86400000).toISOString(),active:data.enabled,expectedVersion:data.expectedVersion}))); }
    }
    if (route === "admin/content") {
      const actor = await adminActor(request.headers,"content.write");
      if (method === "GET") return success((await commerce.listContent(actor)).map(contentDto));
      if (method === "POST") { const data = z.object({ id: z.string().optional(), slug: z.string().max(100), title: z.string().max(200), body: z.string().max(30000), published: z.boolean(), expectedVersion: version.optional() }).strict().parse(await body(request)); return success(contentDto(await commerce.saveContent(actor,{slug:data.slug,title:data.title,body:data.body,status:data.published?"published":"draft",expectedVersion:data.expectedVersion}))); }
    }
    if (route === "admin/collections") { const actor = await adminActor(request.headers,"catalog.write"); if (method === "GET") return success(await commerce.listCollections(actor)); if (method === "POST") return success(await commerce.saveCollection(actor,z.object({id:id.optional(),name:z.string().max(160),slug:z.string().max(160),description:z.string().max(10000),published:z.boolean(),productIds:z.array(id).max(300),expectedVersion:version.optional()}).strict().parse(await body(request)))); }
  }
  return missing();
}
export const GET = api(dispatch);
export const POST = api(dispatch, true);
export const PUT = api(dispatch, true);
export const PATCH = api(dispatch, true);
export const DELETE = api(dispatch, true);
