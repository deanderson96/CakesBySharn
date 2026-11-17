// Enforce that public catalogue prices and backend-validated item keys remain aligned.
// This deliberately fails when an item is reordered without updating the backend.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'catalog.js'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'supabase/functions/submit-enquiry/index.ts'), 'utf8');

const frontMatch = frontend.match(/const MENU = (\[[\s\S]*?\n\]);/);
const backMatch = backend.match(/const catalog:[^=]+ = (\{[\s\S]*?\n\});/);
assert(frontMatch && backMatch, 'Catalogue definition missing');
const menu = vm.runInNewContext('(' + frontMatch[1] + ')');
const validatedCatalog = vm.runInNewContext('(' + backMatch[1] + ')');
let count = 0;
for (const group of menu) {
  for (const [index, item] of group.items.entries()) {
    const key = group.id + ':' + index;
    const stored = validatedCatalog[key];
    assert(stored, 'Missing server catalogue item: ' + key);
    assert(stored.name.startsWith(item.name), 'Product name drift: ' + key);
    const priceType = item.priceType || 'fixed';
    assert.equal(stored.type, priceType, 'Price type drift: ' + key);
    assert.equal(stored.price, item.price == null ? null : Math.round(item.price * 100), 'Price drift: ' + key);
    count++;
  }
}
assert.equal(Object.keys(validatedCatalog).length, count, 'Backend has stale catalogue keys');
console.log('PASS: ' + count + ' product names, stable keys, types and prices match backend.');
