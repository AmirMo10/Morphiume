import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceError } from "@/contracts/commerce";
import { GET, PATCH } from "@/app/api/[...segments]/route";

const state=vi.hoisted(()=>({customer:vi.fn(),admin:vi.fn(),listCustomerNotifications:vi.fn(),listOperatorNotifications:vi.fn(),getNotification:vi.fn(),markNotificationRead:vi.fn(),database:vi.fn()}));
vi.mock("@/server/runtime",()=>({getCommerce:()=>({}),getMockPayments:vi.fn()}));
vi.mock("@/server/auth/actors",()=>({customerActor:state.customer,adminActor:state.admin,adminSession:vi.fn()}));
vi.mock("@/server/db",()=>({pool:{query:state.database}}));
vi.mock("@/server/config",()=>({getConfig:()=>({APP_BASE_URL:"http://localhost:3000",DEPLOYMENT_ENV:"test"})}));
vi.mock("@/server/notifications",()=>({getNotificationFeed:()=>state}));
vi.mock("@/server/analytics-runtime",()=>({analyticsCaptureEnabled:()=>false,getAnalyticsRuntime:vi.fn()}));
vi.mock("@/server/analytics",()=>({getAnalytics:vi.fn()}));
vi.mock("@/server/auth/otp",()=>({readMockOtp:vi.fn()}));
vi.mock("@/server/admin",()=>({getSettings:vi.fn(),saveSettings:vi.fn(),adminDirectory:vi.fn()}));
vi.mock("@/server/media",()=>({uploadMedia:vi.fn()}));
vi.mock("@/server/shipping",()=>({getShippingSettings:vi.fn(),saveShippingSettings:vi.fn()}));
vi.mock("@/server/presentation",()=>({getPresentation:vi.fn(),getAdminPresentation:vi.fn(),savePresentation:vi.fn()}));
vi.mock("@/server/observability",()=>({withRequestContext:(_request:Request,run:()=>unknown)=>run(),finishRequest:(response:Response)=>response,unexpectedFailureCategory:()=>"unexpected",recordCommerceResponse:vi.fn()}));

const customer={kind:"customer",userId:randomUUID(),sessionId:randomUUID()},admin={kind:"admin",userId:randomUUID(),sessionId:randomUUID()},id=randomUUID();
const page={items:[{id,title:"پیام آزمایشی",body:"برای بررسی به حساب مراجعه کنید.",createdAt:"2026-10-12T00:00:00Z",readAt:null}],page:1,pageSize:20,totalItems:1,totalPages:1,unreadCount:"9007199254740993"};
function request(path:string,method="GET",body?:string,origin="http://localhost:3000"){
  return new NextRequest(`http://localhost:3000/api/${path}`,{method,headers:{Origin:origin,"Content-Type":"application/json"},...(body===undefined?{}:{body})});
}
beforeEach(()=>{
  for(const method of Object.values(state))method.mockReset();state.customer.mockResolvedValue(customer);state.admin.mockResolvedValue(admin);
  state.listCustomerNotifications.mockResolvedValue(page);state.listOperatorNotifications.mockResolvedValue(page);state.getNotification.mockResolvedValue(page.items[0]);
  state.markNotificationRead.mockResolvedValue({id,readAt:"2026-10-12T01:00:00Z"});state.database.mockImplementation(()=>{throw new Error("No raw database access in ingress fixtures");});
});
describe("native notification audience delegation and private ingress",()=>{
  it("preserves legacy customer array through guarded feed, without raw shared-table read",async()=>{
    const response=await GET(request("notifications"));expect(response.status).toBe(200);expect(await response.json()).toEqual({data:page.items});
    expect(state.listCustomerNotifications).toHaveBeenCalledExactlyOnceWith(customer,{pageSize:100});expect(state.database).not.toHaveBeenCalled();expect(state.admin).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it.each(["notifications/page","admin/notifications/page","admin/notifications"])("returns paged%s with decimal unread count and explicit audience",async path=>{
    const response=await GET(request(`${path}?page=2&pageSize=10&unreadOnly=true`));expect(response.status).toBe(200);expect(await response.json()).toEqual({data:page});
    const operator=path.startsWith("admin/");expect(operator?state.listOperatorNotifications:state.listCustomerNotifications).toHaveBeenCalledExactlyOnceWith(operator?admin:customer,{page:2,pageSize:10,unreadOnly:true});
    expect(operator?state.customer:state.admin).not.toHaveBeenCalled();expect(state.database).not.toHaveBeenCalled();expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it.each(["customer","operator"] as const)("gets only the native-owned%s audience",async audience=>{
    const response=await GET(request(`${audience==="operator"?"admin/":""}notifications/${id}`));expect(response.status).toBe(200);
    expect(state.getNotification).toHaveBeenCalledExactlyOnceWith(audience==="operator"?admin:customer,id,audience);expect(state.database).not.toHaveBeenCalled();
  });
  it.each(["customer","operator"] as const)("marks only native-owned%s with empty bounded input",async audience=>{
    const response=await PATCH(request(`${audience==="operator"?"admin/":""}notifications/${id}`,"PATCH","{}"));expect(response.status).toBe(200);
    expect(state.markNotificationRead).toHaveBeenCalledExactlyOnceWith(audience==="operator"?admin:customer,id,audience);expect(state.database).not.toHaveBeenCalled();
  });
  it.each(["customer","operator"] as const)("retains uniform404 for denied%s row and no-store",async audience=>{
    state.getNotification.mockRejectedValue(new CommerceError("NOT_FOUND","پیام پیدا نشد.",404));state.markNotificationRead.mockRejectedValue(new CommerceError("NOT_FOUND","پیام پیدا نشد.",404));
    const path=`${audience==="operator"?"admin/":""}notifications/${id}`;
    for(const response of [await GET(request(path)),await PATCH(request(path,"PATCH","{}"))]){expect(response.status).toBe(404);expect(response.headers.get("Cache-Control")).toContain("no-store");}
  });
  it.each(["customer","operator"] as const)("denies native%s before any feed call",async audience=>{
    const operator=audience==="operator";(operator?state.admin:state.customer).mockRejectedValue(new CommerceError(operator?"FORBIDDEN":"UNAUTHENTICATED","ورود معتبر لازم است.",operator?403:401));
    const response=await GET(request(`${operator?"admin/":""}notifications/page`));expect(response.status).toBe(operator?403:401);
    expect(state.listCustomerNotifications).not.toHaveBeenCalled();expect(state.listOperatorNotifications).not.toHaveBeenCalled();
  });
  it.each(["notifications/page?page=0","notifications/page?pageSize=101","admin/notifications/page?unreadOnly=maybe"])("rejects invalid paging%s before feed read",async path=>{
    expect((await GET(request(path))).status).toBe(400);expect(state.listCustomerNotifications).not.toHaveBeenCalled();expect(state.listOperatorNotifications).not.toHaveBeenCalled();
  });
  it.each([JSON.stringify({userId:"TEST-foreign-owner"}),JSON.stringify({audience:"operator"}),JSON.stringify({readAt:"3000-01-01T00:00:00Z"})])("rejects writable authority fields%j before mark",async body=>{
    const response=await PATCH(request(`notifications/${id}`,"PATCH",body));expect(response.status).toBe(400);expect(state.markNotificationRead).not.toHaveBeenCalled();
  });
  it("rejects foreign origin and streamed oversized payload without marking",async()=>{
    expect((await PATCH(request(`notifications/${id}`,"PATCH","{}","http://foreign.invalid"))).status).toBe(403);
    expect((await PATCH(request(`notifications/${id}`,"PATCH",JSON.stringify({canary:"x".repeat(300)})))).status).toBe(413);expect(state.markNotificationRead).not.toHaveBeenCalled();
  });
  it.each(["audience=operator","userId=TEST-foreign-owner","page=1&page=2"])("rejects unknown/repeated list authority fields%s",async query=>{
    for(const prefix of ["","admin/"]){expect((await GET(request(`${prefix}notifications/page?${query}`))).status).toBe(400);}
    expect(state.listCustomerNotifications).not.toHaveBeenCalled();expect(state.listOperatorNotifications).not.toHaveBeenCalled();
  });
});
