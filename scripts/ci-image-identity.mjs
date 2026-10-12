import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

if(process.env.CI!=="true") throw new Error("CI-only accepted image promotion");
const repository=process.env.GITHUB_REPOSITORY?.toLowerCase();
const source=process.env.GITHUB_SHA;
if(!repository || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repository) || !/^[0-9a-f]{40}$/.test(source??"")) throw new Error("Invalid CI image identity");
const image=`ghcr.io/${repository}:${source}`;
const candidate=`ghcr.io/${repository}:candidate-${source}`;
const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",maxBuffer:8_000_000}).trim();
const testedConfig=docker("image","inspect","--format","{{.Id}}",image);
const revision=docker("image","inspect","--format",'{{index .Config.Labels "org.opencontainers.image.revision"}}',image);
if(revision!==source || !/^sha256:[0-9a-f]{64}$/.test(testedConfig)) throw new Error("Tested image source label or config digest is invalid");
const metadata=JSON.parse(await readFile(".local/image-publication.json","utf8"));
const publishedDigest=metadata["containerimage.digest"];
if(!/^sha256:[0-9a-f]{64}$/.test(publishedDigest??"")) throw new Error("Missing candidate manifest identity");
const candidateByDigest=`${candidate}@${publishedDigest}`;
async function configDigest(reference) {
  const manifest=JSON.parse(docker("buildx","imagetools","inspect","--raw",reference));
  if(!manifest.manifests) return manifest.config?.digest;
  const platform=manifest.manifests.filter(entry=>entry.platform?.os==="linux" && entry.platform?.architecture==="amd64");
  if(platform.length!==1) throw new Error("Candidate must contain exactly one Linux amd64 image");
  const platformManifest=JSON.parse(docker("buildx","imagetools","inspect","--raw",`ghcr.io/${repository}@${platform[0].digest}`));
  return platformManifest.config?.digest;
}
if(await configDigest(candidateByDigest)!==testedConfig) throw new Error("Candidate differs from the platform image that passed acceptance; source tag was not promoted");
docker("buildx","imagetools","create","--tag",image,candidateByDigest);
if(await configDigest(image)!==testedConfig) throw new Error("Promoted image no longer matches the accepted platform config");
await writeFile(".local/image-identity.json",JSON.stringify({sourceCommit:source,testedPlatformConfig:testedConfig,candidateManifestDigest:publishedDigest,image},null,2)+"\n");
console.log(`Accepted platform config ${testedConfig} promoted to ${image}; provenance/SBOM manifest preserved.`);
