import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { controlledQaDatabase } from "../../helpers/qa-target.mjs";

const controlled = { DEPLOYMENT_ENV: "staging", PAYMENT_PROVIDER: "mock", SMS_PROVIDER: "mock" };
const connection = (database: string, host = "127.0.0.1") => `postgresql://synthetic:fixture@${host}:15433/${database}`;
const dedicatedDatabase = "morphiume_staging_qa_0123456789abcdef";
describe("controlled QA target prevents accidental live or ambiguous database use", () => {
  it.each([
    ["morphiume_staging", "localhost", "test"],
    ["morphiume_staging_runtime", "127.0.0.1", "staging"],
    ["%6dorphiume_staging", "localhost", "staging"],
    ["morphiume%5Fstaging%5Fruntime", "127.0.0.1", "test"],
  ])("permits exactly decoded %s through %s in %s", (database, host, environment) => {
    const target = controlledQaDatabase({ ...controlled, DEPLOYMENT_ENV: environment, DATABASE_URL: connection(database, host) });
    expect(["morphiume_staging", "morphiume_staging_runtime"]).toContain(decodeURIComponent(target.pathname.slice(1)));
    expect(target.hostname).toBe(host);
  });
  it.each([
    "morphiume", "morphiume_live", "live_morphiume_staging", "morphiume_staging_extra", "morphiume_staging_runtime_backup", "MORPHIUME_STAGING", "morphiume_staging/", "extra/morphiume_staging", "extra/../morphiume_staging", "%2e%2e/morphiume_staging", "%2Fmorphiume_staging", "morphiume_staging%2Fextra", "morphiume_staging%252Fextra", "%256dorphiume_staging", "morphiume_staging%00", "morphiume_staging%", "",
  ])("rejects unsafe/ambiguous database path %s", database => {
    expect(() => controlledQaDatabase({ ...controlled, DATABASE_URL: connection(database) })).toThrow();
  });
  it.each(["192.168.240.51", "db", "remote.invalid", "localhost.remote.invalid", "[::1]"])("requires existing loopback tunnel host, rejecting %s", host => {
    expect(() => controlledQaDatabase({ ...controlled, DATABASE_URL: connection("morphiume_staging", host) })).toThrow();
  });
  it("rejects a query host override that the installed PG parser would actually honor", () => {
    const require = createRequire(import.meta.url), pgRequire = createRequire(require.resolve("pg"));
    const parse = pgRequire("pg-connection-string") as (value: string) => { host: string; database: string };
    const unsafe = `${connection("morphiume_staging")}?host=192.168.240.51`;
    expect(new URL(unsafe).hostname).toBe("127.0.0.1");
    expect(parse(unsafe).host).toBe("192.168.240.51");
    expect(() => controlledQaDatabase({ ...controlled, DATABASE_URL: unsafe })).toThrow();
  });
  it.each(["?host=192.168.240.51", "?database=morphiume_live", "?options=-c%20search_path%3Dlive", "?user=owner", "?port=5432", "?sslmode=require", "?", "#"])("rejects every query/fragment override %s", suffix => {
    expect(() => controlledQaDatabase({ ...controlled, DATABASE_URL: connection("morphiume_staging") + suffix })).toThrow();
  });
  it.each([
    { DEPLOYMENT_ENV: "live" }, { DEPLOYMENT_ENV: "production" }, { DEPLOYMENT_ENV: undefined },
    { PAYMENT_PROVIDER: "real" }, { PAYMENT_PROVIDER: undefined }, { SMS_PROVIDER: "real" }, { SMS_PROVIDER: undefined },
  ])("rejects uncontrolled environment/services %j", override => {
    expect(() => controlledQaDatabase({ ...controlled, ...override, DATABASE_URL: connection("morphiume_staging") })).toThrow();
  });
  it.each([undefined, "not-a-url", "https://localhost/morphiume_staging", "postgresql://localhost?path=/morphiume_staging", `${connection("morphiume_staging")}#live`, ` ${connection("morphiume_staging")}`])("rejects malformed/wrong-protocol target %s without exposing it", DATABASE_URL => {
    expect(() => controlledQaDatabase({ ...controlled, DATABASE_URL })).toThrow(/^QA /u);
    try { controlledQaDatabase({ ...controlled, DATABASE_URL }); }
    catch (error) { expect(error).toBeInstanceOf(Error); expect((error as Error).message).not.toContain("synthetic:fixture"); expect((error as Error).message).not.toContain("postgresql://"); }
  });

  it.each([
    ["morphiume_staging_qa_0000000000000000", "127.0.0.1", "test", "morphiume_staging_qa_0000000000000000"],
    ["morphiume_staging_qa_ffffffffffffffff", "localhost", "staging", "morphiume_staging_qa_ffffffffffffffff"],
    ["%6dorphiume_staging_qa_0123456789abcdef", "127.0.0.1", "test", dedicatedDatabase],
  ])("permits the exact decoded dedicated QA identity %s through %s in %s", (database, host, environment, expectedDatabase) => {
    const target = controlledQaDatabase({ ...controlled, DEPLOYMENT_ENV: environment, DATABASE_URL: connection(database, host) });
    expect(decodeURIComponent(target.pathname.slice(1))).toBe(expectedDatabase);
    expect(target.hostname).toBe(host);
    expect(target.search).toBe("");
  });
  it.each([
    "morphiume_staging_qa_", "morphiume_staging_qa_0123456789abcde", "morphiume_staging_qa_0123456789abcdef0",
    "morphiume_staging_qa_0123456789abcdeF", "morphiume_staging_qa_0123456789abcdeg", "morphiume_staging_qa_live",
    "morphiume_staging_qa_0123456789abcdef_backup", "morphiume_staging_qa_0123456789abcdef_live", "live_morphiume_staging_qa_0123456789abcdef",
    "morphiume_test_qa_0123456789abcdef", "morphiume_staging_qa_0123456789abcdef/", "extra/../morphiume_staging_qa_0123456789abcdef",
    "morphiume_staging_qa_0123456789abcdef%2Fextra", "morphiume_staging_qa_0123456789abcdef%00",
    "%256dorphiume_staging_qa_0123456789abcdef", "%2Fmorphiume_staging_qa_0123456789abcdef",
  ])("rejects a lookalike, ambiguous or incorrectly sized dedicated QA identity %s", database => {
    expect(() => controlledQaDatabase({ ...controlled, DATABASE_URL: connection(database) })).toThrow();
  });
  it.each(["?host=192.168.240.51", "?database=morphiume_live", "?options=-c%20search_path%3Dlive", "?user=owner", "?port=5432", "?sslmode=require", "?", "#"])("does not let a dedicated QA identity bypass query/fragment rejection %s", suffix => {
    expect(() => controlledQaDatabase({ ...controlled, DATABASE_URL: connection(dedicatedDatabase) + suffix })).toThrow();
  });
  it.each(["192.168.240.51", "db", "remote.invalid", "localhost.remote.invalid", "[::1]"])("does not let a dedicated QA identity bypass the existing loopback restriction %s", host => {
    expect(() => controlledQaDatabase({ ...controlled, DATABASE_URL: connection(dedicatedDatabase, host) })).toThrow();
  });
  it.each([
    { DEPLOYMENT_ENV: "live" }, { DEPLOYMENT_ENV: "production" }, { DEPLOYMENT_ENV: undefined },
    { PAYMENT_PROVIDER: "real" }, { PAYMENT_PROVIDER: undefined }, { SMS_PROVIDER: "real" }, { SMS_PROVIDER: undefined },
  ])("does not let a dedicated QA identity bypass mock/non-live gates %j", override => {
    expect(() => controlledQaDatabase({ ...controlled, ...override, DATABASE_URL: connection(dedicatedDatabase) })).toThrow();
  });
});
