import "server-only";
import type { Pool } from "pg";
import type { Commerce } from "../commerce/service";
export type JobEvent={event:"started"|"completed"|"retry"|"dead";jobId:string;type:string;attemptNumber:number;orderId?:string;paymentAttemptId?:string};
type Job={id:string;type:string;payload:Record<string,unknown>;dedupe_key:string;attempts:number};
const observableTypes=new Set(["payment.initialize","payment.reconcile","order.created","order.paid","payment.exception","shipment.updated"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createJobs(options:{pool:Pool;commerce:Commerce;notify?:(type:string,payload:Record<string,unknown>,dedupeKey:string)=>Promise<void>;onJobEvent?:(event:JobEvent)=>void|Promise<void>}){
  function observe(event:JobEvent["event"],job:Job){
    if(!options.onJobEvent)return;
    try{
      if(!uuid.test(job.id) || !Number.isInteger(job.attempts) || job.attempts<1 || job.attempts>12)return;
      const type=observableTypes.has(job.type) ? job.type : "other",payload=job.payload && typeof job.payload==="object" && !Array.isArray(job.payload) ? job.payload : {};
      const id=(value:unknown)=>typeof value==="string" && uuid.test(value) ? value.toLowerCase() : undefined;
      const orderId=type!=="other" ? id(payload.orderId) : undefined,paymentAttemptId=type.startsWith("payment.") ? id(payload.attemptId) : undefined;
      const safe:JobEvent=Object.freeze({event,jobId:job.id.toLowerCase(),type,attemptNumber:job.attempts,...(orderId ? {orderId} : {}),...(paymentAttemptId ? {paymentAttemptId} : {})});
      // Observation is deliberately outside business delivery: a rejecting or
      // unavailable async sink cannot postpone a lease or change its outcome.
      void Promise.resolve(options.onJobEvent(safe)).catch(()=>{});
    }catch{/* A synchronous observer failure cannot change durable job state. */}
  }
  async function tick(){
    const expired=await options.commerce.expireReservations();let processed=0;
    for(let count=0;count<20;count++){
      const result=await options.pool.query<Job>("UPDATE outbox_job SET status='running',attempts=attempts+1,locked_until=now()+interval '60 seconds' WHERE id=(SELECT id FROM outbox_job WHERE (status='pending' OR (status='running' AND locked_until<now())) AND available_at<=now() ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *");
      const job=result.rows[0];if(!job)break;
      observe("started",job);
      try{
        if(job.type==="payment.initialize")await options.commerce.initializeAttempt(String(job.payload.attemptId));
        else if(job.type==="payment.reconcile")await options.commerce.reconcileAttempt(String(job.payload.attemptId));
        else if(options.notify)await options.notify(job.type,job.payload,job.dedupe_key);
        // Internal domain events are durable evidence even when no external notification provider exists.
        await options.pool.query("UPDATE outbox_job SET status='completed',locked_until=null,last_error=null WHERE id=$1",[job.id]);processed++;
        observe("completed",job);
      }catch(error){await options.pool.query("UPDATE outbox_job SET status=$1,locked_until=null,available_at=now()+least(3600,power(2,least(attempts,10))::int)*interval '1 second',last_error=$2 WHERE id=$3",[job.attempts>=12 ? "dead" : "pending",error instanceof Error ? error.message.slice(0,250) : "job failure",job.id]);observe(job.attempts>=12 ? "dead" : "retry",job);}
    }
    return {expired,processed};
  }
  return {tick};
}
