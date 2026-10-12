import { createHash } from "node:crypto";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export function migrationChecksums(sql:string){
  const canonicalSql=sql.replace(/\r\n/g,"\n");
  return {canonicalSql,checksum:hash(canonicalSql),legacyCrlfChecksum:hash(canonicalSql.replace(/\n/g,"\r\n"))};
}
export function classifyMigrationChecksum(sql:string,recordedChecksum:string):"canonical"|"legacy-crlf"|"changed"{
  const checksums=migrationChecksums(sql);
  if(recordedChecksum===checksums.checksum)return "canonical";
  if(recordedChecksum===checksums.legacyCrlfChecksum)return "legacy-crlf";
  return "changed";
}
