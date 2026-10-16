import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entries = JSON.parse(fs.readFileSync(path.join(root, 'data/cases.json'), 'utf8'));
const categories = new Set(['game', 'desktop', 'web', 'android', 'native', 'lab']);
const kinds = new Set(['official', 'community', 'benchmark', 'video']);
const ids = new Set();
const titles = new Set();
const errors = [];
for (const entry of entries) {
  if (!entry.id || ids.has(entry.id)) errors.push(`Duplicate/missing id: ${entry.id}`);
  if (!entry.title || titles.has(entry.title)) errors.push(`Duplicate/missing title: ${entry.title}`);
  ids.add(entry.id); titles.add(entry.title);
  if (!categories.has(entry.category)) errors.push(`Invalid category: ${entry.title}`);
  if (!kinds.has(entry.kind)) errors.push(`Invalid kind: ${entry.title}`);
  const length = [...entry.description].length;
  if (length < 280 || length > 330) errors.push(`Description ${length} chars: ${entry.title}`);
  if (!entry.target || !entry.sources?.length) errors.push(`Missing target/source: ${entry.title}`);
  for (const source of entry.sources || []) {
    try { if (new URL(source.url).protocol !== 'https:') throw Error(); }
    catch { errors.push(`Invalid source: ${source.url}`); }
  }
}
if (errors.length) throw new Error(errors.join('\n'));
fs.writeFileSync(path.join(root, 'dist/cases.js'), `window.REA_CASES = ${JSON.stringify(entries, null, 2)};\n`);
console.log(JSON.stringify({ cases: entries.length, descriptions: '280–330 characters', uniqueIds: ids.size, uniqueTitles: titles.size, sourceLinks: entries.reduce((n, c) => n + c.sources.length, 0) }));
