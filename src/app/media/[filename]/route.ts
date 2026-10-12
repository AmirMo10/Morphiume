import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "@/server/config";
import { pool } from "@/server/db";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: {params:Promise<{filename:string}>}) {
  const {filename} = await context.params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(filename)) return new Response(null,{status:404});
  const result = await pool.query("SELECT id FROM media WHERE public_path=$1 AND status='ready'",[`/media/${filename}`]);
  if (!result.rowCount) return new Response(null,{status:404});
  try { const bytes = await readFile(path.join(getConfig().MEDIA_ROOT,"public",filename)); return new Response(bytes,{headers:{"Content-Type":"image/webp","Cache-Control":"public, max-age=31536000, immutable","X-Content-Type-Options":"nosniff"}}); }
  catch { return new Response(null,{status:404}); }
}
