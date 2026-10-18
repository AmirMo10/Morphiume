import { build } from "esbuild";
await build({
  entryPoints:{worker:"src/server/worker.ts",migrate:"db/migrate.ts",seed:"db/seed.ts","private-preview-operator":"scripts/private-preview-operator.ts"},
  outdir:"dist-runtime",outExtension:{".js":".mjs"},
  bundle:true,platform:"node",target:"node24",format:"esm",packages:"external",
  conditions:["react-server"],sourcemap:false,logLevel:"info",
});
