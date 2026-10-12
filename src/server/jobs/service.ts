import "server-only";
import type { Pool } from "pg";
import type { Commerce } from "../commerce/service";
export function createJobs(options:{pool:Pool;commerce:Commerce;notify?:(type:string,payload:Record<string,unknown>,dedupeKey:string)=>Promise<void>}){
  async function tick(){
    const expired=await options.commerce.expireReservations();let processed=0;
    for(let count=0;count<20;count++){
      const result=await options.pool.query<{id:string;type:string;payload:Record<string,unknown>;dedupe_key:string;attempts:number}>("UPDATE outbox_job SET status='running',attempts=attempts+1,locked_until=now()+interval '60 seconds' WHERE id=(SELECT id FROM outbox_job WHERE (status='pending' OR (status='running' AND locked_until<now())) AND available_at<=now() ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *");
      const job=result.rows[0];if(!job)break;
      try{
        if(job.type==="payment.initialize")await options.commerce.initializeAttempt(String(job.payload.attemptId));
        else if(job.type==="payment.reconcile")await options.commerce.reconcileAttempt(String(job.payload.attemptId));
        else if(options.notify)await options.notify(job.type,job.payload,job.dedupe_key);
        // Internal domain events are durable evidence even when no external notification provider exists.
        await options.pool.query("UPDATE outbox_job SET status='completed',locked_until=null,last_error=null WHERE id=$1",[job.id]);processed++;
      }catch(error){await options.pool.query("UPDATE outbox_job SET status=$1,locked_until=null,available_at=now()+least(3600,power(2,least(attempts,10))::int)*interval '1 second',last_error=$2 WHERE id=$3",[job.attempts>=12 ? "dead" : "pending",error instanceof Error ? error.message.slice(0,250) : "job failure",job.id]);}
    }
    return {expired,processed};
  }
  return {tick};
}
