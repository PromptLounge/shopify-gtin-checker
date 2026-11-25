import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sourceFiles = ['gtin.js', 'barcodes.js', 'check.js', 'readers/shopify-api.js'];
const source = sourceFiles.map(file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  .split('\n').filter(line => !line.startsWith('import ') && !line.startsWith('export {')).join('\n')).join('\n');
const docs = readFileSync(new URL('../examples/n8n.md', import.meta.url), 'utf8');
const [legacyCode, graphQlCode] = [...docs.matchAll(/```js\n([\s\S]+?)\n```/g)].map(match => match[1]);

function runCodeNode(snippet, items) {
  return new Function('$input', `${source}\n${snippet}`)({ all: () => items });
}

test('runs the legacy n8n snippet without external modules', () => {
  const items = [{ json: { handle: 'pan', title: 'Pan', variants: [{ id: 1, barcode: '012345678905' }] } }];
  const findings = runCodeNode(legacyCode, items);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].json.issue, 'Untyped valid GTIN');
  assert.equal(findings[0].json.handle, 'pan');
});

test('runs the typed n8n snippet and detects duplicates across GraphQL pages', () => {
  function page(id, type, value, hasNextPage) {
    return { json: { data: { productVariants: {
      nodes: [{ id, barcodes: { nodes: [{ type, value }] } }], pageInfo: { hasNextPage },
    } } } };
  }

  const firstPage = page('1', 'UPC', '04252614', true);
  const secondPage = page('2', 'EAN', '0042100005264', false);
  const findings = runCodeNode(graphQlCode, [firstPage, secondPage]);
  assert.deepEqual(findings.map(({ json }) => [json.variantId, json.issue]), [['1', 'Duplicate'], ['2', 'Duplicate']]);
  assert.throws(() => runCodeNode(graphQlCode, [firstPage]), /Fetch all Shopify variant pages/);
  assert.throws(() => runCodeNode(graphQlCode, [{ json: { errors: [{ message: 'Throttled' }] } }]), /request failed: Throttled/);
});
