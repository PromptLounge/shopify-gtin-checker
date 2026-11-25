import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const cliPath = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

function temporaryFolder(t) {
  const directory = mkdtempSync(join(tmpdir(), 'shopify-gtin-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function runCli(directory, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd: directory, encoding: 'utf8' });
}

test('reports findings by severity and issue, and refreshes the report on a clean run', t => {
  const directory = temporaryFolder(t);
  const filename = 'products export.csv';
  const inputPath = join(directory, filename);
  const outputPath = join(directory, 'products export-gtin-check.csv');
  const csv = 'Handle,Title,Variant Barcode\nmug,"=2+2, ""Mug""",012345678905\nplate,Plate,N/A\n';
  writeFileSync(inputPath, csv);

  const result = runCli(directory, filename);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Variants checked: 2/);
  assert.match(result.stdout, /Findings: 3 \(1 problem, 1 warning, 1 info\)/);
  assert.match(result.stdout, /Untyped valid GTIN: 1/);
  assert.match(result.stdout, /Placeholder: 1/);
  assert.match(result.stdout, /No standardized barcode: 1/);
  assert.match(result.stdout, /products export-gtin-check\.csv/);

  const report = parse(readFileSync(outputPath), { columns: true });
  assert.equal(report.length, 3);
  assert.equal(report[0]['Barcode values'], '012345678905');
  assert.equal(report[0]['CSV record'], '2');
  assert.equal(report[0]['Product title'], '\'=2+2, "Mug"');
  assert.equal(report[1]['Barcode values'], 'N/A');
  assert.equal(report[2]['Barcode values'], '');
  assert.equal(readFileSync(inputPath, 'utf8'), csv);

  writeFileSync(inputPath, 'URL handle,Title,Barcodes\nmug,Mug,upc:012345678905\n');
  const clean = runCli(directory, filename);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /Findings: 0/);
  const cleanReport = parse(readFileSync(outputPath));
  assert.equal(cleanReport.length, 1);
  assert.deepEqual(cleanReport[0].slice(0, 3), ['Severity', 'Issue', 'Handle']);
  assert.equal(readdirSync(directory).length, 2);
});

test('returns nonzero for invalid arguments and read, parse, or write failures', t => {
  const directory = temporaryFolder(t);
  assert.equal(runCli(directory, '--help').status, 0);
  const noArgument = runCli(directory);
  assert.equal(noArgument.status, 1);
  assert.match(noArgument.stderr, /Usage:/);

  const absent = runCli(directory, 'absent.csv');
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /absent\.csv/);

  writeFileSync(join(directory, 'broken.csv'), 'Handle,Barcodes\npan,"broken');
  const broken = runCli(directory, 'broken.csv');
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /Quote Not Closed/);
  assert.ok(!readdirSync(directory).includes('broken-gtin-check.csv'));

  writeFileSync(join(directory, 'blocked.csv'), 'Handle,Barcodes\npan,upc:012345678905');
  mkdirSync(join(directory, 'blocked-gtin-check.csv'));
  const blocked = runCli(directory, 'blocked.csv');
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /blocked-gtin-check\.csv/);
  assert.ok(!readdirSync(directory).some(name => name.startsWith('.gtin-check-')));
});
