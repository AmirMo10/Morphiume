import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { assertRuntimeSchema } from "../../../src/server/runtime-schema";

const migrations = readdirSync("db/migrations").filter(name=>name.endsWith(".sql")).sort().map(name=>({name,checksum:createHash("sha256").update(readFileSync(`db/migrations/${name}`,"utf8").replaceAll("\r\n","\n")).digest("hex")}));
function database(rows: typeof migrations) { return { query: vi.fn(async()=>({rows})) } as unknown as Pick<Pool,"query">; }
describe("app and worker prerequisite schema readiness",()=>{
  it("matches actual canonical repository0012/0013 hashes with one bounded read-only query",async()=>{
    const pool=database(migrations);await expect(assertRuntimeSchema(pool)).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledOnce();expect((pool.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatch(/^SELECT.*LIMIT 14$/);
  });
  it.each([{label:"old0011",rows:migrations.slice(0,11)},{label:"partial0012",rows:migrations.slice(0,12)},{label:"empty",rows:[]},{label:"unreviewed0014",rows:[...migrations,{name:"0014_unreviewed.sql",checksum:"0".repeat(64)}]}])("rejects $label schema history without applying DDL",async ({rows})=>{
    await expect(assertRuntimeSchema(database(rows))).rejects.toMatchObject({code:"CONFIGURATION",status:503});
  });
  it.each([11,12])("rejects changed appended migration checksum%d",async index=>{
    const rows=migrations.map(row=>({...row}));rows[index]!.checksum="0".repeat(64);
    await expect(assertRuntimeSchema(database(rows))).rejects.toMatchObject({code:"CONFIGURATION",status:503});
  });
  it("maps database outages without exporting source query or private error data",async()=>{
    const pool={query:vi.fn(async()=>{throw new Error("TEST-private-connection-query-canary");})} as unknown as Pick<Pool,"query">;
    try{await assertRuntimeSchema(pool);throw new Error("Expected prerequisite denial");}
    catch(error){expect(error).toMatchObject({code:"CONFIGURATION",status:503});expect(String(error)).not.toContain("TEST-private");}
  });
});
