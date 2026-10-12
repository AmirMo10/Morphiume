import { cp, lstat, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve } from "node:path";

// NFT traces the native addon, but its adjacent DLL/shared-library data can be
// loaded by the OS instead of a JS import. Include only this build's platform.
const root=process.cwd();
const require=createRequire(resolve(root,"package.json"));
const sharpRoot=dirname(dirname(await realpath(require.resolve("sharp"))));
const sharpRequire=createRequire(resolve(sharpRoot,"package.json"));
const sharpPackage=JSON.parse(await readFile(resolve(sharpRoot,"package.json"),"utf8"));
const platform=sharpRequire("./dist/libvips.cjs").runtimePlatformArch();
const nativePackages=[`@img/sharp-${platform}`,`@img/sharp-libvips-${platform}`].filter(name=>sharpPackage.optionalDependencies[name]);
if(!nativePackages.length) throw new Error("Unsupported Sharp deployment platform");
for(const name of nativePackages) {
  const source=dirname(await realpath(sharpRequire.resolve(`${name}/package`)));
  const metadata=JSON.parse(await readFile(resolve(source,"package.json"),"utf8"));
  if(metadata.name!==name || metadata.version!==sharpPackage.optionalDependencies[name]) throw new Error("Unexpected native image dependency version");
  const path=relative(root,source);
  if(!path.replaceAll("\\","/").startsWith("node_modules/") || isAbsolute(path)) throw new Error("Native image dependency escaped the install tree");
  const target=resolve(root,".next/standalone",path);
  await cp(source,target,{recursive:true,force:true});
  const alias=resolve(root,".next/standalone/node_modules",name);
  await mkdir(dirname(alias),{recursive:true});
  try { await lstat(alias); }
  catch(error) { if(error.code!=="ENOENT") throw error; await symlink(relative(dirname(alias),target),alias,process.platform==="win32"?"junction":undefined); }
}
const standaloneRequire=createRequire(resolve(root,".next/standalone/package.json"));
await standaloneRequire("sharp")({create:{width:2,height:2,channels:3,background:{r:0,g:0,b:0}}}).webp().toBuffer();
await writeFile(".next/standalone/morphiume-native-images.json",JSON.stringify({platform,packages:nativePackages,encoderSmoke:"passed"})+"\n");
await mkdir(".next/standalone/.next",{recursive:true});
await cp("public",".next/standalone/public",{recursive:true,force:true});
await cp(".next/static",".next/standalone/.next/static",{recursive:true,force:true});
console.log(`Standalone native ${platform} WebP encoder smoke passed and public assets copied; no credentials generated.`);
