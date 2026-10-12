import { config } from "dotenv";
import { createHash,randomUUID } from "node:crypto";
import { mkdtemp,rm,writeFile } from "node:fs/promises";
import { basename,dirname,join,resolve } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { describe,expect,it } from "vitest";
import { migrate } from "../../../db/migrate";
import { createIsolatedDatabase } from "./isolated-database";

config({path:".env.local",quiet:true});
const databaseUrl=process.env.MIGRATION_DATABASE_URL;
const runtimeUrl=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const enabled=!!databaseUrl && !!runtimeUrl && ["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? "");
describe.skipIf(!enabled)("PostgreSQL migration portability",()=>{
  it("audits an exact legacy CRLF checksum once, accepts either file ending and rejects modified SQL",async()=>{
    const isolated=await createIsolatedDatabase(runtimeUrl!,databaseUrl!),pool=new pg.Pool({connectionString:isolated.migrationUrl,max:1}),nonce=randomUUID().replaceAll("-","");
    const table=`test_migration_${nonce}`,name=`TEST_${nonce}.sql`,temporaryRoot=resolve(tmpdir()),directory=await mkdtemp(join(temporaryRoot,"morphiume-migration-test-"));
    if(!/^test_migration_[0-9a-f]{32}$/.test(table))throw new Error("Unsafe test table identifier");
    if(dirname(resolve(directory))!==temporaryRoot || !basename(directory).startsWith("morphiume-migration-test-"))throw new Error("Unsafe migration fixture cleanup path");
    const sql=`CREATE TABLE "${table}"(id integer);\n`,crlf=sql.replace(/\n/g,"\r\n"),hash=(value:string)=>createHash("sha256").update(value).digest("hex");
    try{
      await writeFile(join(directory,name),crlf,"utf8");await migrate(isolated.migrationUrl,directory);
      expect((await pool.query("SELECT checksum FROM schema_migration WHERE name=$1",[name])).rows[0].checksum).toBe(hash(sql));
      await pool.query("UPDATE schema_migration SET checksum=$1 WHERE name=$2",[hash(crlf),name]);
      await writeFile(join(directory,name),sql,"utf8");await migrate(isolated.migrationUrl,directory);
      const audit=(await pool.query("SELECT old_checksum,new_checksum,reason,database_role FROM schema_migration_checksum_audit WHERE name=$1",[name])).rows;expect(audit).toHaveLength(1);expect(audit[0].old_checksum).toBe(hash(crlf));expect(audit[0].new_checksum).toBe(hash(sql));expect(audit[0].reason).toContain("CRLF-to-LF");expect(audit[0].database_role).toBeTruthy();
      await writeFile(join(directory,name),crlf,"utf8");await migrate(isolated.migrationUrl,directory);expect((await pool.query("SELECT id FROM schema_migration_checksum_audit WHERE name=$1",[name])).rows).toHaveLength(1);
      await writeFile(join(directory,name),sql.replace("integer","bigint"),"utf8");await expect(migrate(isolated.migrationUrl,directory)).rejects.toThrow("Applied migration changed");expect((await pool.query("SELECT checksum FROM schema_migration WHERE name=$1",[name])).rows[0].checksum).toBe(hash(sql));
      expect((await pool.query("SELECT data_type FROM information_schema.columns WHERE table_name=$1 AND column_name='id'",[table])).rows[0].data_type).toBe("integer");
    }finally{
      await pool.end();await isolated.close();await rm(directory,{recursive:true,force:true});
    }
  },60000);
});
