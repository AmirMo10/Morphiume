import { spawn } from "node:child_process";
import { config } from "dotenv";
config({path:".env.local",quiet:true});
const child=spawn(process.execPath,[".next/standalone/server.js"],{stdio:"inherit",env:{...process.env,HOSTNAME:"127.0.0.1",NODE_ENV:"production"}});
for(const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>child.kill(signal));
child.on("error",()=>{console.error("Standalone server could not start.");process.exitCode=1;});
child.on("exit",code=>{process.exitCode=code??1;});
