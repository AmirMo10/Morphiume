import { afterEach, describe, expect, it, vi } from "vitest";
import { ZarinpalPaymentProvider } from "../../../src/server/payments/zarinpal";
import type { PaymentContext } from "../../../src/server/payments/provider";
const merchant="00000000-0000-4000-8000-000000000001";
const context:PaymentContext={attemptId:"attempt",orderId:"order",amountIrr:12340n,currency:"IRR",merchantKey:merchant,callbackUrl:"https://staging.example.invalid/api/payments/zarinpal/callback"};
afterEach(()=>vi.unstubAllGlobals());
describe("official Zarinpal v4 adapter contract",()=>{
  it("requests explicit IRR and never sends a client-derived amount",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({data:{code:100,authority:"S0000000000000000000000000000wwOGYpd"},errors:[]})));
    vi.stubGlobal("fetch",fetcher);const adapter=new ZarinpalPaymentProvider("test",merchant,"https://staging.example.invalid",true);
    const result=await adapter.create(context);expect(result.kind).toBe("created");const body=JSON.parse(String((fetcher.mock.calls[0] as unknown as [string,RequestInit])[1].body));expect(body.amount).toBe(12340);expect(body.currency).toBe("IRR");expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe("https://sandbox.zarinpal.com/pg/v4/payment/request.json");
  });
  it("maps 100/101 identically and preserves reference digits above Number safety",async()=>{
    const adapter=new ZarinpalPaymentProvider("test",merchant,"https://staging.example.invalid",true);
    for(const code of [100,101]){vi.stubGlobal("fetch",async()=>new Response(`{"data":{"code":${code},"ref_id":9223372036854775807},"errors":[]}`));expect(await adapter.verify({...context,authority:"S0000000000000000000000000000wwOGYpd"})).toEqual({kind:"verified",providerRef:"9223372036854775807",alreadyVerified:code===101});}
  });
  it("keeps transport and malformed create outcomes unknown",async()=>{
    const adapter=new ZarinpalPaymentProvider("test",merchant,"https://staging.example.invalid",true);
    vi.stubGlobal("fetch",async()=>{throw new Error("simulated timeout");});expect((await adapter.create(context)).kind).toBe("unknown");
    vi.stubGlobal("fetch",async()=>new Response('{"data":{"code":100},"errors":[]}'));expect((await adapter.create(context)).kind).toBe("unknown");
    expect(()=>new ZarinpalPaymentProvider("live",merchant,"https://example.invalid",true)).toThrow();
  });
});
