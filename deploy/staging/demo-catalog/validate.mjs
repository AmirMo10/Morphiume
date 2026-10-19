// CI/local validation only. No server, network, credentials or data writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from './contract.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const file = path.join(repo, 'deploy/staging/demo-catalog/catalog.json');
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
const assets = {};
for (const item of manifest.products) {
  const filename = path.resolve(repo, item.media.path);
  if (!filename.startsWith(path.join(repo, 'deploy/staging/demo-catalog/media') + path.sep)) throw new Error('Demo catalog stopped: asset containment');
  const info = fs.lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) throw new Error('Demo catalog stopped: regular bounded asset');
  assets[item.key] = fs.readFileSync(filename);
}
validateManifest(manifest, assets);
process.stdout.write(JSON.stringify({ mode: 'demo-catalog-local-manifest-accepted', products: manifest.products.length, variants: manifest.products.reduce((sum, p) => sum + p.apiPayload.variants.length, 0), samplesOnly: true, nativeDecodeProved: false }) + '\n');
