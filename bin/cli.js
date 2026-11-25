#!/usr/bin/env node

import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, parse, resolve } from 'node:path';
import { checkVariants } from '../src/check.js';
import { readShopifyCsv } from '../src/readers/csv.js';

const USAGE = 'Usage: shopify-gtin-checker <shopify-product-export.csv>';
const REPORT_COLUMNS = [
  'Severity', 'Issue', 'Handle', 'Product title', 'Variant title', 'SKU',
  'Variant ID', 'CSV record', 'Barcode types', 'Barcode values', 'Details',
];

function csvCell(value) {
  const text = String(value ?? '');
  // Quoting alone does not keep spreadsheet apps from evaluating formula-like cells.
  const safe = /^[\t\r\n]|^\s*[=+@＝＋－＠]|^\s*-[\s\S]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

async function writeReport(outputPath, findings) {
  const rows = [REPORT_COLUMNS];
  for (const finding of findings) {
    rows.push([
      finding.severity, finding.issue, finding.handle, finding.productTitle,
      finding.variantTitle, finding.sku, finding.variantId, finding.csvRecord,
      finding.barcodes.map(barcode => barcode.type).join('\n'),
      finding.barcodes.map(barcode => barcode.value).join('\n'), finding.message,
    ]);
  }

  const tempDir = await mkdtemp(join(parse(outputPath).dir, '.gtin-check-'));
  try {
    const tempPath = join(tempDir, 'report.csv');
    await writeFile(tempPath, rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n', { mode: 0o600 });
    await rename(tempPath, outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function printSummary(variants, findings, outputPath) {
  const severities = { problem: 0, warning: 0, info: 0 };
  const issues = new Map();
  for (const finding of findings) {
    severities[finding.severity]++;
    issues.set(finding.issue, (issues.get(finding.issue) ?? 0) + 1);
  }

  console.log(`Variants checked: ${variants.length}`);
  console.log(`Findings: ${findings.length} (${severities.problem} problem, ${severities.warning} warning, ${severities.info} info)`);
  for (const [issue, count] of issues) console.log(`  ${issue}: ${count}`);
  console.log(`Report: ${outputPath}`);
}

async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(USAGE);
    return;
  }
  if (args.length !== 1) throw new Error(USAGE);

  const inputPath = resolve(args[0]);
  const { dir, name } = parse(inputPath);
  const outputPath = join(dir, `${name}-gtin-check.csv`);
  const variants = readShopifyCsv(await readFile(inputPath, 'utf8'));
  const findings = checkVariants(variants);
  await writeReport(outputPath, findings);
  printSummary(variants, findings, outputPath);
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(`shopify-gtin-checker: ${error.message}`);
  process.exitCode = 1;
}
