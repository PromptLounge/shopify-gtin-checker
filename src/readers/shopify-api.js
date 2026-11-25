import { normalizeBarcodeType, readLegacyBarcode } from '../barcodes.js';

function readApiBarcodes(variant) {
  if (variant.barcodes == null) {
    if (!Object.hasOwn(variant, 'barcode')) {
      throw new Error(`Shopify variant ${variant.id} has no barcode field. Request barcodes or barcode from Shopify.`);
    }
    if (variant.barcode != null && typeof variant.barcode !== 'string') {
      throw new Error(`Shopify variant ${variant.id} has a barcode with a non-text value.`);
    }
    return readLegacyBarcode(variant.barcode);
  }

  const connection = variant.barcodes;
  if (connection.pageInfo?.hasNextPage) {
    throw new Error(`Shopify variant ${variant.id} has more barcode pages. Fetch all barcodes before checking.`);
  }
  const entries = Array.isArray(connection)
    ? connection
    : connection.nodes ?? connection.edges?.map(edge => edge.node);
  if (!Array.isArray(entries)) {
    throw new Error(`Shopify variant ${variant.id} has an unreadable barcode connection.`);
  }

  return entries.map(entry => {
    if (typeof entry?.value !== 'string') {
      throw new Error(`Shopify variant ${variant.id} has a barcode with a non-text value.`);
    }
    return { type: normalizeBarcodeType(entry.type), value: entry.value.trim() };
  });
}

function readShopifyVariants(records) {
  function readVariant(variant, product) {
    if (variant?.id == null || variant.id === '') throw new Error('A Shopify variant is missing its ID.');

    return {
      id: String(variant.id),
      handle: product?.handle ?? '',
      productTitle: product?.title ?? '',
      variantTitle: variant.title ?? 'Default Title',
      sku: variant.sku ?? '',
      barcodes: readApiBarcodes(variant),
      csvRecord: null,
    };
  }

  return records.flatMap(record => {
    if (Array.isArray(record?.variants)) {
      return record.variants.map(variant => readVariant(variant, record));
    }
    return readVariant(record, record?.product);
  });
}

export { readShopifyVariants };
