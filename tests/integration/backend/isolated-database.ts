import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { migrate } from "../../../db/migrate";

const generatedName=/^test_commerce_[a-f0-9]{32}$/;
const quoteIdentifier=(value:string)=>`"${value.replaceAll('"','""')}"`;
function scopedUrl(raw:string,schema:string){
  if(!generatedName.test(schema))throw new Error("Invalid generated test schema");
  const url=new URL(raw);url.searchParams.set("options",`-c search_path=${schema},public`);return url.toString();
}
/** Real canonical tables/constraints; injected pools keep unmodified worker sweeps out of public. */
export async function createIsolatedDatabase(databaseUrl:string,migrationUrl:string){
  if(!["test","staging"].includes(process.env.DEPLOYMENT_ENV ?? ""))throw new Error("Isolated domain fixtures require test/staging");
  const runtimeAddress=new URL(databaseUrl),ownerAddress=new URL(migrationUrl);
  const loopback=["127.0.0.1","localhost","[::1]"].includes(runtimeAddress.hostname),isolatedName=/(?:^|_)(?:test|staging)(?:_|$)/.test(decodeURIComponent(runtimeAddress.pathname.slice(1)));
  if(process.env.PAYMENT_PROVIDER!=="mock" || process.env.SMS_PROVIDER!=="mock" || !loopback || !isolatedName)throw new Error("Isolated fixtures require mock providers and loopback test/staging database");
  if(runtimeAddress.host!==ownerAddress.host || runtimeAddress.pathname!==ownerAddress.pathname)throw new Error("Fixture runtime and migration database must match");
  const schema=`test_commerce_${randomUUID().replaceAll("-","")}`;
  if(!generatedName.test(schema))throw new Error("Invalid generated test schema");
  const owner=new pg.Pool({connectionString:migrationUrl,max:2}),probe=new pg.Pool({connectionString:databaseUrl,max:1});
  let pool:pg.Pool|undefined,schemaOid:number|undefined,temporaryRole:string|undefined,temporaryRoleOid:number|undefined,temporaryRoleCreated=false,probeEnded=false;
  async function publicSweepState(){return (await owner.query<{jobs:string;reservations:string}>("SELECT (SELECT md5(coalesce(string_agg(id::text||':'||status||':'||attempts||':'||available_at::text||':'||coalesce(locked_until::text,'')||':'||coalesce(last_error,''),',' ORDER BY id),'')) FROM public.outbox_job) AS jobs,(SELECT md5(coalesce(string_agg(id::text||':'||status||':'||expires_at::text,',' ORDER BY id),'')) FROM public.inventory_reservation) AS reservations")).rows[0]!;}
  async function verifySchema(){
    const current=(await owner.query<{oid:number;owned:boolean}>("SELECT oid, nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS owned FROM pg_namespace WHERE nspname=$1",[schema])).rows[0];
    if(!current || current.oid!==schemaOid || !current.owned || !generatedName.test(schema))throw new Error("Generated test schema identity/ownership changed; cleanup refused");
  }
  async function dropOwnedObjects(){
    if(schemaOid!==undefined){await verifySchema();await owner.query(`DROP SCHEMA ${quoteIdentifier(schema)} CASCADE`);if((await owner.query("SELECT oid FROM pg_namespace WHERE nspname=$1",[schema])).rowCount)throw new Error("Generated test schema cleanup failed");schemaOid=undefined;}
    if(temporaryRoleCreated){
      if(!temporaryRole || !generatedName.test(temporaryRole))throw new Error("Invalid generated test role; cleanup refused");
      const role=(await owner.query<{oid:number}>("SELECT oid FROM pg_roles WHERE rolname=$1",[temporaryRole])).rows[0];
      if(!role || role.oid!==temporaryRoleOid)throw new Error("Generated test role identity changed; cleanup refused");
      await owner.query(`DROP ROLE ${quoteIdentifier(temporaryRole)}`);temporaryRoleCreated=false;
      if((await owner.query("SELECT oid FROM pg_roles WHERE rolname=$1",[temporaryRole])).rowCount)throw new Error("Generated test role cleanup failed");
    }
  }
  try{
    const runtime=(await probe.query<{role:string;superuser:boolean}>("SELECT current_user AS role,rolsuper AS superuser FROM pg_roles WHERE rolname=current_user")).rows[0]!;
    const migration=(await owner.query<{role:string;can_create_role:boolean}>("SELECT current_user AS role,rolsuper OR rolcreaterole AS can_create_role FROM pg_roles WHERE rolname=current_user")).rows[0]!;
    await probe.end();probeEnded=true;
    const publicBefore=await publicSweepState();
    await owner.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    schemaOid=(await owner.query<{oid:number}>("SELECT oid FROM pg_namespace WHERE nspname=$1",[schema])).rows[0]!.oid;
    // Both metadata tables must exist locally before IF NOT EXISTS can see public's history.
    await owner.query(`CREATE TABLE ${quoteIdentifier(schema)}.schema_migration(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    await owner.query(`CREATE TABLE ${quoteIdentifier(schema)}.schema_migration_checksum_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text NOT NULL REFERENCES ${quoteIdentifier(schema)}.schema_migration(name),old_checksum text NOT NULL,new_checksum text NOT NULL,reason text NOT NULL,database_role text NOT NULL DEFAULT current_user,occurred_at timestamptz NOT NULL DEFAULT now())`);
    await migrate(scopedUrl(migrationUrl,schema));
    let role=runtime.role,connectionString=scopedUrl(databaseUrl,schema);
    if(runtime.superuser || runtime.role===migration.role){
      if(process.env.CI!=="true" || process.env.DEPLOYMENT_ENV!=="test")throw new Error("Generated fixture roles require CI test environment");
      if(!migration.can_create_role)throw new Error("Fixture runtime must be separate from migration owner");
      temporaryRole=`test_commerce_${randomUUID().replaceAll("-","")}`;
      if(!generatedName.test(temporaryRole))throw new Error("Invalid generated test role");
      const password=randomBytes(32).toString("hex");
      // PostgreSQL role/password DDL cannot bind parameters. Both values are generated hex only.
      await owner.query(`CREATE ROLE ${quoteIdentifier(temporaryRole)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);temporaryRoleCreated=true;
      temporaryRoleOid=(await owner.query<{oid:number}>("SELECT oid FROM pg_roles WHERE rolname=$1",[temporaryRole])).rows[0]!.oid;
      const url=new URL(connectionString);url.username=temporaryRole;url.password=password;connectionString=url.toString();role=temporaryRole;
    }
    await owner.query(`GRANT USAGE ON SCHEMA ${quoteIdentifier(schema)} TO ${quoteIdentifier(role)}`);
    const tables=(await owner.query<{tablename:string}>("SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename NOT IN ('schema_migration','schema_migration_checksum_audit')",[schema])).rows;
    await owner.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE ${tables.map(({tablename})=>`${quoteIdentifier(schema)}.${quoteIdentifier(tablename)}`).join(",")} TO ${quoteIdentifier(role)}`);
    await owner.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${quoteIdentifier(schema)} TO ${quoteIdentifier(role)}`);
    const crossing=(await owner.query("SELECT c.oid FROM pg_constraint c JOIN pg_class source ON source.oid=c.conrelid JOIN pg_class target ON target.oid=c.confrelid WHERE c.contype='f' AND source.relnamespace=$1 AND target.relnamespace<>$1",[schemaOid])).rows;
    if(crossing.length)throw new Error("Fixture foreign key crosses its generated schema");
    pool=new pg.Pool({connectionString,max:8,application_name:`TEST-isolated-${schema}`});
    const resolved=(await pool.query<{nspname:string}>("SELECT n.nspname FROM unnest(ARRAY['user','session','orders','outbox_job','inventory_reservation','inventory_balance','store_setting']) AS name JOIN pg_class c ON c.oid=to_regclass(name) JOIN pg_namespace n ON n.oid=c.relnamespace")).rows;
    if(resolved.length!==7 || resolved.some((row)=>row.nspname!==schema))throw new Error("Runtime fixture table resolution escaped its generated schema");
    const privileges=(await pool.query<{role:string;schema:string;superuser:boolean;createdb:boolean;createrole:boolean;create_schema:boolean}>("SELECT current_user AS role,current_schema() AS schema,rolsuper AS superuser,rolcreatedb AS createdb,rolcreaterole AS createrole,has_schema_privilege(current_user,$1,'CREATE') AS create_schema FROM pg_roles WHERE rolname=current_user",[schema])).rows[0]!;
    if(privileges.role!==role || privileges.schema!==schema || privileges.superuser || privileges.createdb || privileges.createrole || privileges.create_schema)throw new Error("Fixture runtime must resolve its schema with DML-only privileges");
    return {pool,schema,async close(){
      try{
        await pool!.end();
        try{const publicAfter=await publicSweepState();if(publicAfter.jobs!==publicBefore.jobs || publicAfter.reservations!==publicBefore.reservations)throw new Error("Public queue/reservation state changed during isolated fixture suite");}
        finally{await dropOwnedObjects();}
      }finally{await owner.end();}
    }};
  }catch(error){
    await pool?.end();if(!probeEnded)await probe.end();
    try{await dropOwnedObjects();}finally{await owner.end();}throw error;
  }
}
