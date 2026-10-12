import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { defaultPresentation, presentationInput, presentationValue, storeHref } from "../../../src/server/presentation-schema";

describe("editable presentation input and internal routes",()=>{
  it("keeps unapproved claims blank and services disabled by absence",()=>{
    expect(presentationValue.parse(defaultPresentation)).toEqual(defaultPresentation);
    expect(defaultPresentation.heroTitle).toBeNull();expect(defaultPresentation.services).toEqual([]);
    expect(defaultPresentation.maintenance).toEqual({enabled:false,message:null});
  });
  it("allows supported internal links and rejects script, external, traversal and encoded routes",()=>{
    for(const href of ["/products","/collections","/guide","/account","/cart","/favorites","/pages/approved-policy","/products/fragrance-1","/collections/selection-2"])expect(storeHref.safeParse(href).success).toBe(true);
    for(const href of ["https://example.invalid","//example.invalid","javascript:alert(1)","/../admin","/products/%2e%2e/admin","/admin","/api/test","/pages/unknown?token=secret","/products#secret","/pages/<script>","/products\\admin"])expect(storeHref.safeParse(href).success).toBe(false);
  });
  it("bounds editable plain text, menus, services, feature IDs and versions",()=>{
    const input={...structuredClone(defaultPresentation),expectedVersion:1,reason:"approved edit"};
    expect(presentationInput.parse(input).expectedVersion).toBe(1);
    for(const change of [{reason:" "},{expectedVersion:0},{expectedVersion:1.5},{expectedVersion:2147483647},{heroTitle:"x".repeat(161)},{headerLinks:Array(9).fill({label:"x",href:"/products"})},{featuredProductIds:Array(13).fill(randomUUID())},{services:Array(5).fill({title:"x",description:"x",enabled:false,link:null})},{brandName:"invented"}])expect(presentationInput.safeParse({...input,...change}).success).toBe(false);
  });
  it("rejects duplicate/invalid product IDs and trims approved content without evaluating HTML",()=>{
    const id=randomUUID();expect(presentationValue.safeParse({...defaultPresentation,featuredProductIds:[id,id]}).success).toBe(false);
    expect(presentationValue.safeParse({...defaultPresentation,featuredProductIds:[id,id.toUpperCase()]}).success).toBe(false);
    expect(presentationValue.parse({...defaultPresentation,featuredProductIds:[id.toUpperCase()]}).featuredProductIds).toEqual([id]);
    expect(presentationValue.safeParse({...defaultPresentation,featuredProductIds:["not-an-id"]}).success).toBe(false);
    expect(presentationValue.parse({...defaultPresentation,heroTitle:"  <script>plain text</script>  "}).heroTitle).toBe("<script>plain text</script>");
  });
});
