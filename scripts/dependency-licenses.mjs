import { readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const project=JSON.parse(await readFile("package.json","utf8"));
const entries=[];
for(const [scope,dependencies] of Object.entries({runtime:project.dependencies,development:project.devDependencies})) {
  for(const [name,pinned] of Object.entries(dependencies)) {
    const bytes=await readFile(resolve("node_modules",name,"package.json"));
    const metadata=JSON.parse(bytes.toString("utf8"));
    if(metadata.name!==name || metadata.version!==pinned) throw new Error(`Installed dependency differs from pin: ${name}`);
    entries.push({name,version:metadata.version,scope,declaredLicense:metadata.license??"NOASSERTION",repository:typeof metadata.repository==="string"?metadata.repository:metadata.repository?.url??null,metadataSha256:createHash("sha256").update(bytes).digest("hex")});
  }
}
entries.sort((a,b)=>a.name.localeCompare(b.name,"en"));
await writeFile("docs/DEPENDENCY_LICENSES.json",JSON.stringify({packageManager:project.packageManager,coverage:"Installed direct dependencies; upstream declarations, not a legal compliance certification. Image transitive/OS inventory comes from the accepted image SBOM.",entries},null,2)+"\n");
console.log(`Recorded exact installed metadata and declared licenses for ${entries.length} direct dependencies.`);
