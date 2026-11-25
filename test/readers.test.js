import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBarcodes } from '../src/barcodes.js';
import { checkVariants } from '../src/check.js';
import { readShopifyCsv } from '../src/readers/csv.js';
import { readShopifyVariants } from '../src/readers/shopify-api.js';

test('parses Shopify escapes, case-insensitive types, and literal Custom values', () => {
  const cell = String.raw` gTin:012345678905 ; ns-pid:part\;123; NS_pid:x\:y; NSpid:abc\\def; loose\:part; CUSTOM:x:y; gtin: `;
  assert.deepEqual(parseBarcodes(cell), [
    { type: 'GTIN', value: '012345678905' },
    { type: 'NS-PID', value: 'part;123' },
    { type: 'NS-PID', value: 'x:y' },
    { type: 'NS-PID', value: 'abc\\def' },
    { type: 'CUSTOM', value: 'loose:part' },
    { type: 'CUSTOM', value: 'x:y' },
    { type: 'GTIN', value: '' },
  ]);
  assert.deepEqual(parseBarcodes('  ; ;  '), []);
});

test('keeps an untyped barcode with escaped delimiters together in a Shopify export', () => {
  const cell = String.raw`PV\;ESCAPE\:001`;
  const expected = [{ type: 'CUSTOM', value: 'PV;ESCAPE:001' }];
  assert.deepEqual(parseBarcodes(cell), expected);
  const [variant] = readShopifyCsv(`Handle,Title,Variant Barcodes\nitem,Item,${cell}\n`);
  assert.deepEqual(variant.barcodes, expected);
});

test('reads a BOM, multiline HTML, image rows, and blank barcodes in a current export', () => {
  const csv = [
    '\ufeffURL handle,Title,Description,Option1 value,SKU,Barcodes,Product image URL',
    'mug,"Mug, enamel","<p title=""Details"">Line 1, with comma\r\nLine 2</p>",Blue,001,upc:012345678905,https://example.com/blue.png',
    'mug,,,Red,,,',
    'mug,,,,,,https://example.com/extra.png',
    'plate,Plate,,Default Title,,asin:B001234567,',
  ].join('\r\n');

  const variants = readShopifyCsv(csv);
  assert.deepEqual(variants, [
    {
      id: 'csv:2', handle: 'mug', productTitle: 'Mug, enamel', variantTitle: 'Blue', sku: '001',
      barcodes: [{ type: 'UPC', value: '012345678905' }], csvRecord: 2,
    },
    { id: 'csv:3', handle: 'mug', productTitle: 'Mug, enamel', variantTitle: 'Red', sku: '', barcodes: [], csvRecord: 3 },
    {
      id: 'csv:5', handle: 'plate', productTitle: 'Plate', variantTitle: 'Default Title', sku: '',
      barcodes: [{ type: 'ASIN', value: 'B001234567' }], csvRecord: 5,
    },
  ]);
  assert.deepEqual(checkVariants(variants).map(finding => finding.variantId), ['csv:3', 'csv:5']);
});

test('accepts Variant Barcodes and preserves old singular columns as literal values', () => {
  const [typed] = readShopifyCsv('Handle,Title,Variant SKU,Variant Barcodes\npan,Pan,0001,upc:012345678905; NS_PID:MODEL');
  assert.deepEqual(typed.barcodes, [{ type: 'UPC', value: '012345678905' }, { type: 'NS-PID', value: 'MODEL' }]);

  const legacy = 'Handle,Title,Body (HTML),Variant SKU,Variant Barcode,Image Src\npan,Pan,,0001,NS-PID:part;123,\n';
  const [literal] = readShopifyCsv(legacy);
  assert.deepEqual(literal.barcodes, [{ type: 'CUSTOM', value: 'NS-PID:part;123' }]);
  assert.deepEqual(readShopifyCsv('Handle,Title,Barcode\n'), []);

  const reducedExport = readShopifyCsv('Handle,Barcode\nplate,\n');
  assert.deepEqual(checkVariants(reducedExport).map(finding => finding.issue), ['No standardized barcode']);
});

test('rejects empty, foreign, and malformed CSV files', () => {
  assert.throws(() => readShopifyCsv(''), /CSV is empty/);
  assert.throws(() => readShopifyCsv('Name,Value\nPan,12'), /Expected a Shopify product CSV/);
  assert.throws(() => readShopifyCsv('Handle,Barcodes\n,012345678905'), /missing its product handle/);
  assert.throws(() => readShopifyCsv('Handle,Barcodes\npan,"unclosed'), /Quote Not Closed/);
  assert.throws(() => readShopifyCsv('Handle,Barcodes\npan,1,extra'), /Invalid Record Length/);
});

test('normalizes equivalent CSV and GraphQL data and prefers the full connection', () => {
  const csv = 'Handle,Title,Option1 Value,Variant ID,Variant SKU,Variant Barcodes\npan,Pan,Small,15,001,upc:04252614; NSPID:A12';
  const [csvVariant] = readShopifyCsv(csv);
  const [apiVariant] = readShopifyVariants([{
    id: '15', title: 'Small', sku: '001', product: { handle: 'pan', title: 'Pan' }, barcode: 'unneeded',
    barcodes: { nodes: [{ type: 'UPC', value: '04252614' }, { type: 'NS_PID', value: 'A12' }] },
  }]);
  assert.deepEqual({ ...csvVariant, csvRecord: null }, apiVariant);
  assert.deepEqual(checkVariants([apiVariant]), []);
});

test('normalizes GraphQL edges, legacy Shopify products, and individual variants', () => {
  const variants = readShopifyVariants([
    { handle: 'pan', title: 'Pan', variants: [{ id: 1, barcode: '012345678905' }, { id: 2, barcode: null }] },
    { id: '3', barcode: 'x:y;z' },
    { id: '4', barcodes: { edges: [{ node: { type: null, value: '012345678905' } }] } },
    { id: '5', barcodes: [], barcode: 'unneeded' },
  ]);
  assert.deepEqual(variants.map(({ id }) => id), ['1', '2', '3', '4', '5']);
  assert.equal(variants[0].productTitle, 'Pan');
  assert.deepEqual(variants.map(({ barcodes }) => barcodes.map(barcode => barcode.value)), [
    ['012345678905'], [], ['x:y;z'], ['012345678905'], [],
  ]);
  assert.throws(() => readShopifyVariants([{ id: 'v1' }]), /no barcode field/);
  assert.throws(() => readShopifyVariants([{ id: 'v1', barcode: 12345 }]), /non-text value/);
  assert.throws(() => readShopifyVariants([{ id: 'v1', barcodes: { nodes: [], pageInfo: { hasNextPage: true } } }]), /more barcode pages/);
});
