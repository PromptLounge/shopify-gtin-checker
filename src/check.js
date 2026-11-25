import { normalizeBarcodeType } from './barcodes.js';
import { expandUpcE, isValidGtin, isValidIsbn10 } from './gtin.js';

const STANDARD_TYPES = new Set(['GTIN', 'UPC', 'EAN', 'ISBN']);
const PLACEHOLDERS = new Set(['none', 'n/a', 'na', 'null', 'tbd', 'no barcode', '-']);

function standardizedIdentifier({ type, value }) {
  switch (type) {
    case 'UPC': {
      const upc = value.length === 12 ? value : expandUpcE(value);
      return upc && isValidGtin(upc) ? { gtin: upc } : null;
    }
    case 'EAN':
      return [8, 13].includes(value.length) && isValidGtin(value) ? { gtin: value } : null;
    case 'ISBN':
      if (isValidIsbn10(value)) return { gtin: null };
      return value.length === 13 && /^97[89]/.test(value) && isValidGtin(value)
        ? { gtin: value }
        : null;
    case 'GTIN':
      return isValidGtin(value) ? { gtin: value } : null;
    case 'CUSTOM':
      if (isValidGtin(value)) return { gtin: value };
      return isValidIsbn10(value) ? { gtin: null } : null;
    default:
      return null;
  }
}

function checkVariants(variants) {
  const findings = [];
  const gtinVariants = new Map();

  function addFinding(variant, issue, severity, message, barcodes = []) {
    findings.push({
      issue,
      severity,
      variantId: variant.id,
      handle: variant.handle,
      productTitle: variant.productTitle,
      variantTitle: variant.variantTitle,
      sku: variant.sku,
      csvRecord: variant.csvRecord,
      barcodes,
      message,
    });
  }

  for (const variant of variants) {
    let hasStandardizedBarcode = false;

    for (const entry of variant.barcodes) {
      const type = normalizeBarcodeType(entry.type);
      const value = entry.value.trim();
      const barcode = { type, value: entry.value };

      if (PLACEHOLDERS.has(value.toLowerCase()) || /^0+$/.test(value)) {
        addFinding(variant, 'Placeholder', 'warning', 'Replace or remove this placeholder barcode.', [barcode]);
        continue;
      }

      const identifier = standardizedIdentifier({ type, value });
      if (!identifier) {
        if (STANDARD_TYPES.has(type)) {
          addFinding(variant, 'Invalid check digit', 'problem', 'Check the barcode value and format against the printed barcode.', [barcode]);
        }
        if ((type === 'CUSTOM' || (STANDARD_TYPES.has(type) && type !== 'ISBN')) &&
            value.length === 11 && isValidGtin(`0${value}`)) {
          addFinding(variant, 'Missing leading zero', 'warning', `Check whether the printed UPC is 0${value}.`, [barcode]);
        }
        if (type === 'CUSTOM') {
          const expanded = expandUpcE(value);
          if (expanded && isValidGtin(expanded)) {
            addFinding(variant, 'Possible UPC-E', 'warning', 'Looks like a UPC-E. Set the type to UPC.', [barcode]);
          }
        }
        continue;
      }

      hasStandardizedBarcode = true;
      if (value.length === 14 && /^[1-8]/.test(value)) {
        addFinding(variant, 'Possible case code', 'warning', 'Check whether this 14-digit code is from the outer case or the individual item.', [barcode]);
      } else if (value.length === 14 && value.startsWith('9')) {
        addFinding(variant, 'Variable-measure code', 'warning', 'Variable-measure code, usually for items sold by weight', [barcode]);
      }
      if (!identifier.gtin) continue;

      if (type === 'CUSTOM') {
        addFinding(variant, 'Untyped valid GTIN', 'info', 'Valid GTIN without a type. Shopify accepts it. Setting the type to GTIN makes it unambiguous for other tools.', [barcode]);
      }

      const gtin = identifier.gtin.padStart(14, '0');
      if (!gtinVariants.has(gtin)) gtinVariants.set(gtin, new Map());
      const matches = gtinVariants.get(gtin);
      if (!matches.has(variant.id)) matches.set(variant.id, { variant, barcodes: [] });
      const match = matches.get(variant.id);
      if (!match.barcodes.some(saved => saved.type === barcode.type && saved.value === barcode.value)) {
        match.barcodes.push(barcode);
      }
    }

    if (!hasStandardizedBarcode) {
      addFinding(variant, 'No standardized barcode', 'problem', 'Add a valid standardized barcode if the product has one. Otherwise, confirm the no-barcode declaration in Shopify.');
    }
  }

  for (const [gtin, matches] of gtinVariants) {
    if (matches.size < 2) continue;
    for (const { variant, barcodes } of matches.values()) {
      addFinding(variant, 'Duplicate', 'warning', `Check the assignment of GTIN ${gtin}, found on ${matches.size} variants.`, barcodes);
    }
  }

  return findings;
}

export { checkVariants };
