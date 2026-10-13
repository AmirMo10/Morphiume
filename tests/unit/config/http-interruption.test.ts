import { NextRequest } from "next/server";
import { APIError } from "better-auth/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, boundedBody, success } from "../../../src/server/http";

afterEach(()=>vi.restoreAllMocks());
function silence(){vi.spyOn(console,"log").mockImplementation(()=>{});vi.spyOn(console,"error").mockImplementation(()=>{});}
function streamed(aborted:boolean){
  const controller=new AbortController();if(aborted)controller.abort();
  const stream=new ReadableStream<Uint8Array>({start(c){c.error(new Error("TEST-private-stream-transport-canary"));}});
  return new NextRequest("http://localhost:3000/api/cart/items",{method:"POST",signal:controller.signal,body:stream,duplex:"half"} as NonNullable<ConstructorParameters<typeof NextRequest>[1]>);
}
describe("interrupted body and maintained native-auth error status",()=>{
  it.each([false,true])("preserves streamed body-limit413 after successful cancel; signal aborted=%s",async(aborted)=>{
    silence();const controller=new AbortController();if(aborted)controller.abort();const cancel=vi.fn();
    const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(1025));},cancel});
    const request=new NextRequest("http://localhost:3000/api/cart/items",{method:"POST",signal:controller.signal,body:stream,duplex:"half"} as NonNullable<ConstructorParameters<typeof NextRequest>[1]>);
    const domain=vi.fn();const response=await api(async current=>{await boundedBody(current,1024);domain();return success({ok:true});})(request);
    expect(response.status).toBe(413);expect(await response.json()).toMatchObject({error:{code:"VALIDATION"}});expect(cancel).toHaveBeenCalledTimes(1);expect(domain).not.toHaveBeenCalled();
  });
  it("maps failed read plus observed cancellation499 before any domain work",async()=>{
    silence();const domain=vi.fn();
    const response=await api(async request=>{await boundedBody(request,1024);domain();return success({ok:true});})(streamed(true));
    expect(response.status).toBe(499);expect(await response.json()).toMatchObject({error:{code:"REQUEST_INTERRUPTED"}});expect(domain).not.toHaveBeenCalled();expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("keeps a stream failure without cancellation as a real internal500",async()=>{
    silence();const domain=vi.fn();const response=await api(async request=>{await boundedBody(request,1024);domain();return success({ok:true});})(streamed(false));
    expect(response.status).toBe(500);expect(domain).not.toHaveBeenCalled();expect(JSON.stringify(await response.json())).not.toContain("TEST-private");
  });
  it("does not infer a failed read from a signal alone on an already-buffered body",async()=>{
    silence();const controller=new AbortController();controller.abort();
    const request=new NextRequest("http://localhost:3000/api/cart/items",{method:"POST",signal:controller.signal,body:"{}"});
    expect(new TextDecoder().decode(await boundedBody(request,1024))).toBe("{}");
  });
  it("keeps a downstream failure500 after a successful read despite an aborted signal",async()=>{
    silence();const controller=new AbortController();controller.abort();
    const request=new NextRequest("http://localhost:3000/api/cart/items",{method:"POST",signal:controller.signal,body:"{}"});
    const response=await api(async current=>{await boundedBody(current,1024);throw new Error("TEST-private-domain-failure");})(request);
    expect(response.status).toBe(500);expect(await response.json()).toMatchObject({error:{code:"INTERNAL"}});
  });
  it("keeps truncated buffered JSON as validation400",async()=>{
    silence();const response=await api(async request=>{JSON.parse(new TextDecoder().decode(await boundedBody(request,1024)));return success({ok:true});})(new NextRequest("http://localhost:3000/api/cart/items",{method:"POST",body:"{"}));
    expect(response.status).toBe(400);expect(await response.json()).toMatchObject({error:{code:"VALIDATION"}});
  });
  it.each([["UNAUTHORIZED",401,"UNAUTHENTICATED"],["FORBIDDEN",403,"FORBIDDEN"]] as const)("keeps native%s denial%scode%s without forwarding headers/private message",async(status,expected,code)=>{
    silence();const response=await api(async()=>{throw new APIError(status,{message:"TEST-private-auth-error-canary"},{"X-Private-Canary":"must-not-forward"});})(new NextRequest("http://localhost:3000/api/cart/items"));
    expect(response.status).toBe(expected);expect(await response.json()).toMatchObject({error:{code}});expect(response.headers.get("X-Private-Canary")).toBeNull();expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("does not turn native internal500 into anonymous guest success",async()=>{
    silence();const response=await api(async()=>{throw new APIError("INTERNAL_SERVER_ERROR",{message:"TEST-private-native-store-error"});})(new NextRequest("http://localhost:3000/api/cart/items"));
    expect(response.status).toBe(500);expect(await response.json()).toMatchObject({error:{code:"INTERNAL"}});
  });
});
