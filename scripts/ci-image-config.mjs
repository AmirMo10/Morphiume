import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parse } from "dotenv";
import { validateCiDatabaseConfiguration } from "./ci-runtime-role.mjs";

if (process.env.CI !== "true") throw new Error("CI-only synthetic image configuration generator");
const settings=parse(await readFile(".env.local","utf8"));
validateCiDatabaseConfiguration(settings);
const keys=["DATABASE_URL","AUTH_SECRET","ADMIN_AUTH_SECRET","MOCK_CONTROL_SECRET","APP_BASE_URL","PAYMENT_PROVIDER","SMS_PROVIDER","ANONYMOUS_ANALYTICS_ENABLED"];
const runtime=Object.fromEntries(keys.map(key=>{
  if(!settings[key]) throw new Error(`Missing synthetic configuration key: ${key}`);
  return [key,settings[key]];
}));
runtime.MEDIA_ROOT="/app/media";
await mkdir(".local/image-media",{recursive:true,mode:0o700});
await writeFile(".local/image-runtime.json",JSON.stringify(runtime),{mode:0o600,flag:"wx"});
// Only the migration container receives the bootstrap owner credential.
const migration={DATABASE_URL:settings.MIGRATION_DATABASE_URL,PAYMENT_PROVIDER:"mock",SMS_PROVIDER:"mock",ANONYMOUS_ANALYTICS_ENABLED:"false"};
await writeFile(".local/image-migration.json",JSON.stringify(migration),{mode:0o600,flag:"wx"});
await writeFile(".local/image-env",["DEPLOYMENT_ENV=staging","NODE_ENV=production","HOSTNAME=127.0.0.1","PORT=3000","MORPHIUME_RUNTIME_CONFIG=/runtime/config.json"].join("\n")+"\n",{mode:0o600,flag:"wx"});
await writeFile(".local/image-seed-env",["BOOTSTRAP_ADMIN_EMAIL","BOOTSTRAP_ADMIN_PASSWORD"].map(key=>{
  if(!settings[key] || /[\r\n]/.test(settings[key])) throw new Error("Invalid synthetic bootstrap configuration");
  return `${key}=${settings[key]}`;
}).join("\n")+"\n",{mode:0o600,flag:"wx"});
console.log("Private synthetic container configuration prepared; values omitted.");
