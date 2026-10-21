import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const before = process.env.BEFORE_SHA;
const after = process.env.AFTER_SHA || 'HEAD';
const emptySha = /^0+$/.test(before || '');
const range = before && !emptySha ? `${before}..${after}` : after;
const output = execFileSync('git', ['diff', '--name-only', range, '--', 'products'], { encoding: 'utf8' });
const files = output.split(/\r?\n/).filter((file) => file.endsWith('.json'));

const parts = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Costa_Rica',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false
}).formatToParts(new Date()).reduce((values, part) => ({ ...values, [part.type]: part.value }), {});
const timestamp = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;

for (const file of files) {
  const product = JSON.parse(await readFile(file, 'utf8'));
  product.updatedAt = timestamp;
  if (product.visible === undefined) product.visible = true;
  await writeFile(file, `${JSON.stringify(product, null, 2)}\n`, 'utf8');
}

console.log(`Registro actualizado en ${files.length} producto(s).`);
