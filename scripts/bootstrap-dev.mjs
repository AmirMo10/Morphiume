import { spawn } from "node:child_process";
import { config } from "dotenv";
config({path:".env.local",quiet:true});
if(process.env.DEPLOYMENT_ENV!=="test") throw new Error("Development bootstrap requires isolated DEPLOYMENT_ENV=test.");
for(const key of ["DATABASE_URL","AUTH_SECRET","ADMIN_AUTH_SECRET","MOCK_CONTROL_SECRET","BOOTSTRAP_ADMIN_EMAIL","BOOTSTRAP_ADMIN_PASSWORD"]) if(!process.env[key]) throw new Error(`Configure ${key} privately before bootstrapping.`);
function run(args) {return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:"inherit",env:process.env});child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(new Error(`Development command exited ${code}`)));});}
await run(["--conditions=react-server","--import","tsx","db/migrate.ts"]);
await run(["--conditions=react-server","--import","tsx","db/seed.ts"]);
await run(["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1"]);
