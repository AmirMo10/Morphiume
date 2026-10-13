import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
if (process.env.CI !== "true") throw new Error("CI-only synthetic configuration generator");
const database = "postgresql://morphiume_ci:ephemeral-ci-only@127.0.0.1:5432/morphiume_staging";
const secret = () => randomBytes(32).toString("hex");
await mkdir(".local", {recursive:true});
const settings = {DEPLOYMENT_ENV:"test",APP_BASE_URL:"http://localhost:3000",DATABASE_URL:database,MIGRATION_DATABASE_URL:database,AUTH_SECRET:secret(),ADMIN_AUTH_SECRET:secret(),MOCK_CONTROL_SECRET:secret(),PAYMENT_PROVIDER:"mock",SMS_PROVIDER:"mock",ANONYMOUS_ANALYTICS_ENABLED:"true",ANONYMOUS_ANALYTICS_PG_TESTS:"true",NOTIFICATION_EVENTS_PG_TESTS:"true",NOTIFICATION_INTEGRATION_PG_TESTS:"true",MEDIA_ROOT:`${process.cwd()}/.local/media`,BOOTSTRAP_ADMIN_EMAIL:"owner@morphiume.test",BOOTSTRAP_ADMIN_PASSWORD:secret()};
await writeFile(".env.local",Object.entries(settings).map(([key,value])=>`${key}=${value}`).join("\n")+"\n",{mode:0o600,flag:"wx"});
console.log("Isolated CI test configuration generated; credentials omitted.");
