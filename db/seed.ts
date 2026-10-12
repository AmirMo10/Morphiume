import { randomUUID } from "node:crypto";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";
import { config } from "dotenv";
config({path:".env.local",quiet:true});

async function seed(){
  if(!["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? ""))throw new Error("Seed requires DEPLOYMENT_ENV=test|staging");
  const url=process.env.DATABASE_URL;if(!url)throw new Error("DATABASE_URL required");
  const pool=new pg.Pool({connectionString:url,max:2});const client=await pool.connect();
  try{await client.query("BEGIN");
    const email=process.env.BOOTSTRAP_ADMIN_EMAIL,password=process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if(email || password){if(!email || !password || password.length<16)throw new Error("Bootstrap requires email and password >=16 characters");const id=randomUUID();const existing=await client.query<{id:string}>('SELECT id FROM "user" WHERE email=$1',[email]);if(!existing.rows[0]){await client.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',[id,"مدیر آزمایشی",email]);await client.query("INSERT INTO account(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2,'credential',$3)",[randomUUID(),id,await hashPassword(password)]);await client.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')",[id]);console.log("Bootstrap admin created; real TOTP enrollment required. No admin grant issued.");}}
    // Clearly marked sample, never an assertion about Morphiume's actual products.
    const productId="00000000-0000-4000-8000-000000000001",variantId="00000000-0000-4000-8000-000000000002";
    await client.query("INSERT INTO product(id,name,slug,description,concentration,family,top_notes,heart_notes,base_notes,image_url,status,search_key) VALUES($1,'عطر نمونهٔ آزمایشی','sample-test-perfume','این کالا فقط برای آزمایش فروشگاه است و محصول واقعی Morphiume نیست.','آزمایشی','نمونه','[\"نمونه\"]','[]','[]','/assets/sample-perfume.svg','draft','عطر نمونه آزمایشی') ON CONFLICT(id) DO NOTHING",[productId]);
    await client.query("INSERT INTO variant(id,product_id,sku,volume_ml,price_irr) VALUES($1,$2,'TEST-50',50,1000000) ON CONFLICT(id) DO NOTHING",[variantId,productId]);
    await client.query("INSERT INTO inventory_balance(variant_id,on_hand) VALUES($1,10) ON CONFLICT DO NOTHING",[variantId]);
    await client.query("INSERT INTO inventory_ledger(id,variant_id,operation_key,on_hand_delta,reserved_delta,reason) VALUES($1,$2,'seed:test-50',10,0,'clearly marked test fixture') ON CONFLICT(operation_key) DO NOTHING",[randomUUID(),variantId]);
    await client.query("COMMIT");console.log("Staging fixture seeded as draft.");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();await pool.end();}
}
void seed().catch((error:unknown)=>{console.error(error instanceof Error ? error.message : "Seed failed");process.exitCode=1;});
