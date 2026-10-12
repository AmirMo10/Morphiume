/* Run with sharp installed or MORPHIUME_SHARP_PATH set to the bundled package. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require(process.env.MORPHIUME_SHARP_PATH || 'sharp');
const root = path.resolve(__dirname, '../..');
const brand = path.join(root, 'public/brand');
const output = path.join(root, 'docs/design');

function luminance(hex) {
  const channels = hex.replace('#', '').match(/.{2}/g).map(v => parseInt(v, 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

async function main() {
  const tokens = JSON.parse(await fs.readFile(path.join(output, 'tokens.json'), 'utf8'));
  const checks = tokens.contrastPairs.map(pair => {
    const actual = ratio(tokens.color[pair.foreground], tokens.color[pair.background]);
    if (actual < pair.min) throw new Error(`${pair.foreground}/${pair.background} contrast ${actual} < ${pair.min}`);
    return { ...pair, actual: Number(actual.toFixed(2)), passed: true };
  });
  const files = (await fs.readdir(brand)).filter(name => name.endsWith('.svg')).sort();
  if (files.length !== 10) throw new Error('Expected all 10 SVG deliverables');
  for (const file of files) {
    const svg = await fs.readFile(path.join(brand, file), 'utf8');
    if (!svg.includes('<title') || !svg.includes('viewBox=')) throw new Error(`Missing title/viewBox: ${file}`);
    if (/<(?:image|script|foreignObject|text)\b|(?:href|url)\s*[=:]/i.test(svg)) throw new Error(`Non-geometry or external content: ${file}`);
    await sharp(Buffer.from(svg)).png().toBuffer();
  }
  const font = await fs.readFile(path.join(brand, 'fonts/Vazirmatn[wght].woff2'));
  if (font.subarray(0, 4).toString() !== 'wOF2') throw new Error('Invalid WOFF2 signature');
  const license = await fs.readFile(path.join(brand, 'fonts/OFL.txt'), 'utf8');
  if (!license.includes('SIL OPEN FONT LICENSE Version 1.1')) throw new Error('Missing OFL 1.1 license');
  const skill = await fs.readFile(path.join(root, '.agents/skills/morphiume-brand-ux/SKILL.md'), 'utf8');
  if (!/^---\nname: morphiume-brand-ux\ndescription: ".+"\n---\n/.test(skill)) throw new Error('Skill front matter invalid');

  for (const size of [16, 32, 128]) {
    await sharp(path.join(brand, 'favicon.svg')).resize(size, size).png().toFile(path.join(output, `favicon-${size}.png`));
  }
  await sharp(path.join(brand, 'morphiume-wordmark.svg')).resize({ width: 160 }).png().toFile(path.join(output, 'wordmark-160.png'));

  const board = Buffer.from(`<svg width="1080" height="820" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="820" fill="#F6F2EB"/>
  <g font-family="Arial,sans-serif" fill="#20211F"><text x="48" y="48" font-size="22">Morphiume / original vector concepts / 2026-10-12</text>
  <text x="48" y="102" font-size="15">A — selected: custom wordmark</text>
  <text x="650" y="102" font-size="15">B — negative-space M</text>
  <text x="48" y="292" font-size="15">C — two controlled curves + wordmark</text>
  <text x="48" y="498" font-size="15">Selected wordmark: minimum width 160px</text>
  <text x="650" y="498" font-size="15">Light identity on wine</text>
  <text x="48" y="630" font-size="15">Compact favicon: native 16px / 32px / 128px</text>
  <text x="48" y="793" font-size="13">Geometry only. No embedded bitmap or font. Trademark clearance not assessed.</text></g>
  <rect x="632" y="510" width="400" height="80" fill="#5C2333"/>
  </svg>`);
  const composites = [
    { input: await sharp(path.join(brand, 'concept-a-wordmark.svg')).resize({ width: 526 }).png().toBuffer(), left: 48, top: 115 },
    { input: await sharp(path.join(brand, 'concept-b-monogram.svg')).resize(128, 128).png().toBuffer(), left: 694, top: 109 },
    { input: await sharp(path.join(brand, 'concept-c-curves.svg')).resize({ width: 690 }).png().toBuffer(), left: 48, top: 304 },
    { input: await sharp(path.join(brand, 'morphiume-wordmark.svg')).resize({ width: 160 }).png().toBuffer(), left: 48, top: 529 },
    { input: await sharp(path.join(brand, 'morphiume-wordmark-light.svg')).resize({ width: 270 }).png().toBuffer(), left: 666, top: 518 },
    { input: await fs.readFile(path.join(output, 'favicon-16.png')), left: 48, top: 682 },
    { input: await fs.readFile(path.join(output, 'favicon-32.png')), left: 112, top: 674 },
    { input: await fs.readFile(path.join(output, 'favicon-128.png')), left: 192, top: 632 },
  ];
  await sharp(board).composite(composites).png().toFile(path.join(output, 'brand-board.png'));
  const hashes = {};
  for (const file of ['fonts/Vazirmatn[wght].woff2', 'fonts/OFL.txt', ...files]) {
    hashes[file] = crypto.createHash('sha256').update(await fs.readFile(path.join(brand, file))).digest('hex');
  }
  await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify({ date: '2026-10-12',
    svgRendered: files, faviconSizes: [16, 32, 128], wordmarkWidth: 160,
    skillFrontMatter: 'passed basic structural check', fontSignature: 'wOF2', contrast: checks, sha256: hashes,
    limits: ['Application/browser/assistive-technology tests are not performed by this script', 'Trademark clearance not assessed'] }, null, 2) + '\n');
  console.log(`Rendered ${files.length} SVGs; checked ${checks.length} contrast pairs, font signature/license and skill front matter; produced visual review board.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
