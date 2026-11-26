# Shopify GTIN Checker

Check every barcode in a Shopify product export for invalid check digits, possible case codes, variable-measure codes, missing leading zeros, untyped GTINs, placeholders, and duplicates. The command runs locally, and your export never leaves your computer.

Since 1 November 2026, the EU requires product identifiers for items in applicable parcels valued at €150 or less that are shipped from outside the EU to EU consumers. Shopify uses the identifiers when you buy an EU shipping label. This tool checks the barcodes in your catalog. [Shopify’s EU product identifier guidance](https://help.shopify.com/en/manual/international/shipping/eu-product-identifiers)

## What it checks

| Finding | Level | What it means |
| --- | --- | --- |
| Invalid check digit | Problem | A barcode typed as GTIN, UPC, EAN, or ISBN fails its format or checksum check. |
| Missing leading zero | Warning | An 11-digit code passes the UPC-A checksum with a leading zero. Check it against the printed barcode. |
| Possible case code | Warning | A valid 14-digit value starting with `1` through `8` could be the code on the outer case. Check which barcode is on the individual item. |
| Variable-measure code | Warning | A valid 14-digit value starting with `9` identifies a variable-measure item, usually sold by weight. |
| Untyped valid GTIN | Info | Shopify accepts this Custom value. Setting its type to GTIN makes it unambiguous for other tools. |
| Possible UPC-E | Warning | An untyped eight-digit value looks like a valid UPC-E. Check the printed barcode and set the type to UPC if it matches. |
| Placeholder | Warning | The value is a placeholder such as `N/A`, `none`, or all zeros. |
| Duplicate | Warning | The same GTIN appears on multiple variants. Matching includes equivalent UPC-E, UPC-A, and zero-padded values. |
| No standardized barcode | Problem | Add a valid barcode if the product has one. Otherwise, confirm the **No EU standardized identifier** declaration in Shopify. |

A valid 14-digit value starting with `0` is treated as a padded item barcode. [GS1 guidance on zero padding](https://ref.gs1.org/guidelines/2d-in-retail/)

## Requirements

Node.js 20 or newer. Run `node -v` to check your version. [Download Node.js](https://nodejs.org/en/download)

## Usage

1. In Shopify, go to **Products → Export**, then choose **All products** and either CSV format.
2. Open a terminal in the folder with the export. Once the package is published, run:

   ```sh
   npx @promptlounge/shopify-gtin-checker products_export_1.csv
   ```

The terminal shows the finding counts. The command saves the full report next to the export as `products_export_1-gtin-check.csv` and refreshes that report on subsequent runs. Each row is a finding. The **CSV record** column counts the header as record 1 and treats quoted multiline fields as part of one record. If opening the report in a spreadsheet, import barcode columns as text to keep leading zeros visible.

To use a local checkout, run `npm ci` in the repo, then run `node bin/cli.js /path/to/products_export_1.csv`.

## Use it in n8n

The checks in `src/gtin.js`, `src/barcodes.js`, and `src/check.js` use no external dependencies. You can paste them into an n8n Code node, including on n8n Cloud, and feed them product data from the Shopify node. The setup example also covers typed barcodes from the Admin GraphQL API. [n8n setup example](examples/n8n.md)

## Learn more

- The full walkthrough for store owners. [Reading EU product identifiers in a Shopify export](https://promptlounge.tech/guides/shopify-eu-product-identifiers-export-check)
- The developer write-up on dev.to. [How the GTIN check digit works](https://dev.to/promptlounge/validating-shopify-barcodes-for-the-eu-product-identifier-rules-3mp7)
- What the EU requirement asks of Shopify stores. [EU Product Identifiers on Shopify](https://promptlounge.tech/guides/shopify-eu-product-identifiers)

Built by [Prompt Lounge](https://promptlounge.tech), automations and open-source tools for e-commerce store operations.

## License

[MIT](LICENSE)
