import { parse } from 'csv-parse/sync';
import { parseBarcodes, readLegacyBarcode } from '../barcodes.js';

const VARIANT_COLUMNS = new Set([
  'price', 'compare-at price', 'cost per item', 'inventory quantity', 'inventory tracker',
  'continue selling when out of stock', 'fulfillment service', 'requires shipping',
  'charge tax', 'weight value (grams)', 'weight unit for display',
]);

function readShopifyCsv(text) {
  const [header, ...records] = parse(text, { bom: true, skip_empty_lines: true });
  if (!header) throw new Error('The CSV is empty. Expected a Shopify product export.');

  const headers = header.map(column => column.trim().toLowerCase());
  const handleColumn = headers.findIndex(column => column === 'handle' || column === 'url handle');
  const barcodesColumn = headers.findIndex(column => column === 'barcodes' || column === 'variant barcodes');
  const barcodeColumn = headers.findIndex(column => column === 'barcode' || column === 'variant barcode');

  if (handleColumn < 0 || (barcodesColumn < 0 && barcodeColumn < 0)) {
    throw new Error('Expected a Shopify product CSV with a Handle or URL handle column and a Barcode or Barcodes column.');
  }

  const titleColumn = headers.indexOf('title');
  const variantTitleColumn = headers.indexOf('variant title');
  const idColumn = headers.indexOf('variant id');
  const skuColumn = headers.findIndex(column => column === 'sku' || column === 'variant sku');
  const optionColumns = [1, 2, 3].map(option => headers.indexOf(`option${option} value`));
  const variantColumns = headers.flatMap((column, index) => {
    const isVariantDetail = column.startsWith('variant ') && !column.startsWith('variant image');
    return isVariantDetail || VARIANT_COLUMNS.has(column) ? [index] : [];
  });

  const products = new Map();
  const variants = [];
  for (const [index, record] of records.entries()) {
    const csvRecord = index + 2;
    const cell = column => record[column]?.trim() ?? '';
    const handle = cell(handleColumn);
    if (!handle) {
      if (record.every(value => value.trim() === '')) continue;
      throw new Error(`CSV record ${csvRecord} is missing its product handle.`);
    }

    const title = cell(titleColumn);
    const firstProductRow = !products.has(handle);
    if (firstProductRow || title) products.set(handle, title);

    const sku = cell(skuColumn);
    const barcodeCell = cell(barcodesColumn >= 0 ? barcodesColumn : barcodeColumn);
    const options = optionColumns.map(cell).filter(Boolean);
    if (!firstProductRow && !title && !sku && !barcodeCell && !options.length && !variantColumns.some(cell)) {
      continue;
    }

    variants.push({
      id: cell(idColumn) || `csv:${csvRecord}`,
      handle,
      productTitle: products.get(handle) ?? '',
      variantTitle: cell(variantTitleColumn) || options.join(' / ') || 'Default Title',
      sku,
      barcodes: barcodesColumn >= 0 ? parseBarcodes(barcodeCell) : readLegacyBarcode(barcodeCell),
      csvRecord,
    });
  }

  return variants;
}

export { readShopifyCsv };
