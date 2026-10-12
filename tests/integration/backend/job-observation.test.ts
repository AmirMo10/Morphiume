import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCommerce, type Commerce } from "../../../src/server/commerce/service";
import { createJobs, type JobEvent } from "../../../src/server/jobs/service";
import { MockPaymentProvider } from "../../../src/server/payments/mock";
import { createIsolatedDatabase } from "./isolated-database";

config({path:".env.local",quiet:true});
const databaseUrl=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,migrationUrl=process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
const enabled=!!databaseUrl && !!migrationUrl && ["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? "");
describe.skipIf(!enabled)("PostgreSQL safe job observation",()=>{
  let isolated:Awaited<ReturnType<typeof createIsolatedDatabase>>,pool:pg.Pool,commerce:Commerce;
  beforeAll(async()=>{isolated=await createIsolatedDatabase(databaseUrl!,migrationUrl!);pool=isolated.pool;commerce=createCommerce({pool,payments:new MockPaymentProvider(pool,"test","http://127.0.0.1:3000"),deploymentEnv:"test",appBaseUrl:"http://127.0.0.1:3000"});},60000);
  afterAll(async()=>{if(isolated)await isolated.close();});
  async function job(type:string,payload:object,attempts=0){const id=randomUUID();await pool.query("INSERT INTO outbox_job(id,type,payload,dedupe_key,attempts,available_at) VALUES($1,$2,$3::jsonb,$4,$5,now()-interval '365 days')",[id,type,JSON.stringify(payload),`TEST secret dedupe ${id}`,attempts]);return id;}
  it("emits only safe completion fields despite synchronous observer failure and private unknown type",async()=>{
    const orderId=randomUUID(),id=await job("order.created",{orderId,attemptId:randomUUID(),recipient:"TEST private contact",amountIrr:"12345",authority:"TEST private provider evidence"}),unknown=await job("TEST private unknown job type",{orderId}),events:JobEvent[]=[];
    const result=await createJobs({pool,commerce,notify:async()=>{},onJobEvent:event=>{events.push(event);throw new Error("TEST observer unavailable");}}).tick();expect(result).toEqual({expired:0,processed:2});
    expect(events.filter(event=>event.jobId===id)).toEqual([{event:"started",jobId:id,type:"order.created",attemptNumber:1,orderId},{event:"completed",jobId:id,type:"order.created",attemptNumber:1,orderId}]);expect(events.filter(event=>event.jobId===unknown)).toEqual([{event:"started",jobId:unknown,type:"other",attemptNumber:1},{event:"completed",jobId:unknown,type:"other",attemptNumber:1}]);
    expect(JSON.stringify(events)).not.toMatch(/private|authority|amountIrr|recipient|dedupe|observer/);expect((await pool.query("SELECT status,last_error FROM outbox_job WHERE id=ANY($1::uuid[])",[[id,unknown]])).rows).toEqual([{status:"completed",last_error:null},{status:"completed",last_error:null}]);
  });
  it("preserves retry/dead outcomes with async observer rejection and UUID-only correlations",async()=>{
    const orderId=randomUUID(),paymentAttemptId=randomUUID(),retry=await job("payment.exception",{orderId,attemptId:paymentAttemptId,provider:"TEST secret"}),dead=await job("shipment.updated",{orderId:"TEST not uuid",phone:"TEST contact"},11),events:JobEvent[]=[];
    const result=await createJobs({pool,commerce,notify:async()=>{throw new Error("TEST actual delivery failure");},onJobEvent:async event=>{events.push(event);throw new Error("TEST async observer unavailable");}}).tick();expect(result).toEqual({expired:0,processed:0});
    expect(events.filter(event=>event.jobId===retry)).toEqual([{event:"started",jobId:retry,type:"payment.exception",attemptNumber:1,orderId,paymentAttemptId},{event:"retry",jobId:retry,type:"payment.exception",attemptNumber:1,orderId,paymentAttemptId}]);expect(events.filter(event=>event.jobId===dead)).toEqual([{event:"started",jobId:dead,type:"shipment.updated",attemptNumber:12},{event:"dead",jobId:dead,type:"shipment.updated",attemptNumber:12}]);
    const rows=(await pool.query("SELECT id,status,attempts,last_error,locked_until FROM outbox_job WHERE id=ANY($1::uuid[]) ORDER BY id",[[retry,dead]])).rows;expect(rows.find(row=>row.id===retry)).toMatchObject({status:"pending",attempts:1,last_error:"TEST actual delivery failure",locked_until:null});expect(rows.find(row=>row.id===dead)).toMatchObject({status:"dead",attempts:12,last_error:"TEST actual delivery failure",locked_until:null});expect(JSON.stringify(events)).not.toMatch(/secret|contact|failure|unavailable|error/);
    // Keep this exact generated-schema retry fixture out of the next case's
    // due queue. Runtime leasing/filtering is unchanged, and public is untouched.
    await pool.query("UPDATE outbox_job SET available_at=now()+interval '365 days' WHERE id=$1",[retry]);
  });
  it("does not wait for an unavailable observer to settle before durable completion",async()=>{
    const id=await job("order.paid",{orderId:randomUUID()}),events:JobEvent[]=[];
    const result=await createJobs({pool,commerce,notify:async()=>{},onJobEvent:event=>{events.push(event);return new Promise<void>(()=>{});}}).tick();expect(result.processed).toBe(1);expect(events.map(event=>event.event)).toEqual(["started","completed"]);expect((await pool.query("SELECT status FROM outbox_job WHERE id=$1",[id])).rows).toEqual([{status:"completed"}]);
  });
});
