import { execFileSync } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';

const before = process.env.BEFORE_SHA;
const after = process.env.AFTER_SHA || 'HEAD';
const emptySha = /^0+$/.test(before || '');
const range = before && !emptySha ? `${before}..${after}` : after;
const output = execFileSync('git', ['diff', '--name-only', range, '--', 'products'], { encoding: 'utf8' });
const files = output.split(/\r?\n/).filter((file) => file.endsWith('.json'));

for (const file of files) {
  try { await access(file); } catch { continue; }
  const product = JSON.parse(await readFile(file, 'utf8'));
  product.updatedAt = new Date().toISOString();
  if (product.visible === undefined) product.visible = true;
  await writeFile(file, `${JSON.stringify(product, null, 2)}\n`, 'utf8');
}

console.log(`Registro actualizado en ${files.length} producto(s).`);
