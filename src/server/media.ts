import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import type { Actor } from "@/contracts/commerce";
import { CommerceError } from "@/contracts/commerce";
import { getConfig } from "./config";
import { pool } from "./db";
import { boundedBody } from "./http";

export async function uploadMedia(request: Request, actor: Actor) {
  const max = 4*1024*1024;
  if (Number(request.headers.get("content-length") ?? 0) > max+65536) throw new CommerceError("VALIDATION","تصویر باید کمتر از چهار مگابایت باشد.",413);
  const bytesBody = await boundedBody(request,max+65536);
  const bounded = new Request(request.url,{method:"POST",headers:request.headers,body:bytesBody as Uint8Array<ArrayBuffer>});
  const form = await bounded.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size > max || file.size === 0 || !["image/jpeg","image/png","image/webp"].includes(file.type)) throw new CommerceError("VALIDATION","یک تصویر JPEG، PNG یا WebP کمتر از چهار مگابایت انتخاب کنید.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const image = sharp(bytes,{limitInputPixels:20_000_000,animated:false});
  let metadata: Metadata;
  try { metadata = await image.metadata(); } catch { throw new CommerceError("VALIDATION","محتوای تصویر معتبر نیست."); }
  if (!metadata.width || !metadata.height || metadata.width>6000 || metadata.height>6000 || !["jpeg","png","webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1)>1) throw new CommerceError("VALIDATION","اندازه یا قالب تصویر معتبر نیست.");
  if (({jpeg:"image/jpeg",png:"image/png",webp:"image/webp"} as Record<string,string>)[metadata.format!] !== file.type) throw new CommerceError("VALIDATION","قالب اعلام‌شده با محتوای تصویر هماهنگ نیست.");
  const result = await image.rotate().resize({width:1600,height:1600,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});
  const id = randomUUID();
  const root = getConfig().MEDIA_ROOT;
  const original = path.join(root,"private",id);
  const derived = path.join(root,"public",`${id}.webp`);
  await mkdir(path.dirname(original),{recursive:true,mode:0o700}); await mkdir(path.dirname(derived),{recursive:true,mode:0o750});
  try {
    await writeFile(original,bytes,{flag:"wx",mode:0o600}); await writeFile(derived,result.data,{flag:"wx",mode:0o644});
    const url = `/media/${id}.webp`;
    const db = await pool.connect();
    try { await db.query("BEGIN"); await db.query("INSERT INTO media(id,public_path,private_object_key,mime_type,width,height,status,created_by) VALUES($1,$2,$3,'image/webp',$4,$5,'ready',$6)",[id,url,id,result.info.width,result.info.height,actor.userId]); await db.query("INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,reason) VALUES($1,$2,'media.created','media',$3,'بارگذاری و پردازش تصویر محصول')",[randomUUID(),actor.userId,id]); await db.query("COMMIT"); }
    catch(error) {await db.query("ROLLBACK");throw error;} finally {db.release();}
    return {id,url,width:result.info.width,height:result.info.height};
  } catch(error) { await Promise.allSettled([rm(original,{force:true}),rm(derived,{force:true})]); throw error; }
}
