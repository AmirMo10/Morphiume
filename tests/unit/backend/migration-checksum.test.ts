import { createHash } from "node:crypto";
import { describe,expect,it } from "vitest";
import { classifyMigrationChecksum,migrationChecksums } from "../../../db/migration-checksum";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
describe("migration byte integrity",()=>{
  const lf="CREATE TABLE migration_fixture(id integer);\nCREATE INDEX migration_fixture_idx ON migration_fixture(id);\n",crlf=lf.replace(/\n/g,"\r\n");
  it("uses one checksum for LF and CRLF files and recognizes only their exact historical hashes",()=>{
    expect(migrationChecksums(lf).checksum).toBe(migrationChecksums(crlf).checksum);
    expect(classifyMigrationChecksum(lf,hash(lf))).toBe("canonical");
    expect(classifyMigrationChecksum(crlf,hash(lf))).toBe("canonical");
    expect(classifyMigrationChecksum(lf,hash(crlf))).toBe("legacy-crlf");
  });
  it("rejects changed SQL, whitespace or removed content even when newline variants are supported",()=>{
    expect(classifyMigrationChecksum(lf.replace("integer","bigint"),hash(crlf))).toBe("changed");
    expect(classifyMigrationChecksum(lf+"-- changed source\n",hash(lf))).toBe("changed");
    expect(classifyMigrationChecksum(lf.replace("id integer","id  integer"),hash(lf))).toBe("changed");
    expect(classifyMigrationChecksum(lf.trimEnd(),hash(crlf))).toBe("changed");
  });
});
