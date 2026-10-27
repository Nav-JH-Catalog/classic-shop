import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const productsDirectory = path.join(root, 'products');
const outputFile = path.join(root, 'products.json');
const files = (await readdir(productsDirectory))
  .filter((file) => file.endsWith('.json'))
  .sort((a, b) => a.localeCompare(b, 'es'));

const products = [];
const identifiers = new Set();

for (const file of files) {
  const product = JSON.parse(await readFile(path.join(productsDirectory, file), 'utf8'));
  product.id ||= path.basename(file, '.json');
  if (product.id !== path.basename(file, '.json')) throw new Error(`${file}: el identificador debe coincidir con el nombre del archivo`);

  for (const field of ['name', 'category', 'price', 'description', 'status']) {
    if (!product[field]) throw new Error(`${file}: falta el campo ${field}`);
  }

  if (identifiers.has(product.id)) throw new Error(`${file}: identificador duplicado ${product.id}`);
  identifiers.add(product.id);
  products.push(product);
}

products.sort((a, b) =>
  (a._order ?? Number.MAX_SAFE_INTEGER) - (b._order ?? Number.MAX_SAFE_INTEGER) ||
  a.name.localeCompare(b.name, 'es')
);

for (const product of products) delete product._order;

await writeFile(outputFile, `${JSON.stringify(products, null, 2)}\n`, 'utf8');
console.log(`Catálogo generado: ${products.length} productos.`);
