import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBarcodes } from '../src/barcodes.js';
import { checkVariants } from '../src/check.js';
import { expandUpcE, isValidGtin, isValidIsbn10 } from '../src/gtin.js';

function variant(id, cell) {
  return { id, handle: 'test-product', barcodes: parseBarcodes(cell) };
}

function issues(...args) {
  return checkVariants([variant('1', ...args)]).map(({ issue, severity }) => `${severity} ${issue}`);
}

test('checks all four GS1 lengths and rejects bad checksums or lengths', () => {
  for (const gtin of ['96385074', '012345678905', '4006381333931', '10012345678902']) {
    assert.equal(isValidGtin(gtin), true, gtin);
    assert.equal(isValidGtin(`${gtin.slice(0, -1)}9`), false, gtin);
  }
  assert.equal(isValidGtin('12345678905'), false);
  assert.equal(isValidGtin('01234567890X'), false);
});

test('validates typed EAN lengths and recognizes both ISBN lengths', () => {
  assert.equal(isValidIsbn10('080442957X'), true);
  assert.equal(isValidIsbn10('080442957x'), true);
  assert.equal(isValidIsbn10('08044295X7'), false);
  assert.equal(isValidIsbn10('0804429570'), false);
  assert.deepEqual(issues('ean:96385074; EAN:4006381333931; isbn:080442957X; ISBN:9780262033848'), []);
  assert.deepEqual(issues('080442957X'), []);
  const bad = ['isbn:4006381333931', 'isbn:9780262033849', 'ean:012345678905', 'gtin:4006381333932'];
  for (const barcode of bad) {
    assert.deepEqual(issues(barcode), ['problem Invalid check digit', 'problem No standardized barcode'], barcode);
  }
});

test('expands each UPC-E compression branch and validates the resulting UPC-A', () => {
  const samples = [
    ['01234505', '012000003455'], ['01234514', '012100003454'], ['01234523', '012200003453'],
    ['11234538', '112300000458'], ['01234543', '012340000053'], ['01234596', '012345000096'],
  ];
  for (const [compressed, expanded] of samples) {
    assert.equal(expandUpcE(compressed), expanded);
    assert.equal(isValidGtin(expanded), true);
    assert.deepEqual(issues(`UPC:${compressed}`), []);
  }
  assert.equal(expandUpcE('24252614'), null);
  assert.deepEqual(issues('UPC:96385074'), ['problem Invalid check digit', 'problem No standardized barcode']);
});

test('distinguishes typed UPC-E, Custom UPC-E, and ambiguous eight-digit values', () => {
  assert.deepEqual(issues('UPC:04252614'), []);
  assert.deepEqual(issues('04252614'), ['warning Possible UPC-E', 'problem No standardized barcode']);
  assert.deepEqual(issues('04252614; UPC:012345678905'), ['warning Possible UPC-E']);
  assert.deepEqual(issues('01234565'), ['info Untyped valid GTIN']);
  assert.deepEqual(issues('UPC:01234565'), []);
  for (const value of ['04252619', '01234560']) {
    assert.deepEqual(issues(value), ['problem No standardized barcode']);
    assert.deepEqual(issues(`UPC:${value}`), ['problem Invalid check digit', 'problem No standardized barcode']);
  }
});

test('reports leading zeros, Custom GTINs, and missing identifiers', () => {
  assert.deepEqual(issues('12345678905'), ['warning Missing leading zero', 'problem No standardized barcode']);
  assert.deepEqual(issues('UPC:12345678905'), ['problem Invalid check digit', 'warning Missing leading zero', 'problem No standardized barcode']);
  assert.deepEqual(issues('NS-PID:012345678905; ASIN:080442957X'), ['problem No standardized barcode']);
  assert.deepEqual(issues(''), ['problem No standardized barcode']);
  const [missing] = checkVariants([variant('1', '')]);
  assert.match(missing.message, /confirm the no-barcode declaration/);
});

test('distinguishes padded item, possible case, and variable-measure codes', () => {
  assert.deepEqual(issues('gtin:00012345678905'), []);
  assert.deepEqual(issues('00012345678905'), ['info Untyped valid GTIN']);
  assert.deepEqual(issues('gtin:10012345678902'), ['warning Possible case code']);
  assert.deepEqual(issues('gtin:80012345678901'), ['warning Possible case code']);
  assert.deepEqual(issues('10012345678902'), ['warning Possible case code', 'info Untyped valid GTIN']);
  assert.deepEqual(issues('gtin:90012345678908'), ['warning Variable-measure code']);
  assert.deepEqual(issues('gtin:90012345678909'), ['problem Invalid check digit', 'problem No standardized barcode']);
  const [variableMeasure] = checkVariants([variant('1', 'gtin:90012345678908')]);
  assert.equal(variableMeasure.message, 'Variable-measure code, usually for items sold by weight');
});

test('recognizes every placeholder and never uses an all-zero value for duplicate matching', () => {
  for (const value of ['NONE', 'N/A', 'na', 'NULL', 'tbd', 'no barcode', '-', '000000000000']) {
    assert.deepEqual(issues(`gtin:${value}`), ['warning Placeholder', 'problem No standardized barcode']);
  }

  const findings = checkVariants([variant('a', '00000000'), variant('b', 'ean:00000000')]);
  assert.equal(findings.length, 4);
  assert.ok(findings.every(finding => finding.issue !== 'Duplicate'));
});

test('matches equivalent GTINs across variants and preserves each stored representation', () => {
  const first = variant('a', 'upc:04252614; upc:042100005264; upc:04252614');
  assert.deepEqual(checkVariants([first, first]), []);

  const findings = checkVariants([
    first,
    variant('b', 'ean:0042100005264'),
    variant('c', '00042100005264'),
    variant('d', '04252614; 42100005264'),
  ]);
  const duplicates = findings.filter(finding => finding.issue === 'Duplicate');
  assert.deepEqual(duplicates.map(finding => finding.variantId), ['a', 'b', 'c']);
  assert.deepEqual(duplicates.map(finding => finding.barcodes.map(barcode => barcode.value)), [
    ['04252614', '042100005264'], ['0042100005264'], ['00042100005264'],
  ]);
  assert.ok(duplicates.every(finding => /00042100005264, found on 3 variants/.test(finding.message)));
});
