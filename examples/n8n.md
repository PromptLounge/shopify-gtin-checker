# Check Shopify barcodes in n8n

Use one JavaScript Code node in **Run Once for All Items** mode. The same code works on n8n Cloud and self-hosted n8n.

## Copy the checker into the Code node

From the repository root, run this command and paste its output into the Code node:

```sh
sed -e '/^import /d' -e '/^export {/d' \
  src/gtin.js src/barcodes.js src/check.js src/readers/shopify-api.js
```

You can also copy the contents of those four files in that order, leaving out the `import` and `export` lines. Add one of the snippets below at the end of the Code node.

## Legacy data from the Shopify node

Set the Shopify node to **Product → Get all products** and enable **Return All**. Connect it to the Code node. The Shopify node returns the legacy `barcode` field, which supplies only the first barcode on each variant. [n8n Shopify node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.shopify/) · [Shopify barcode compatibility](https://shopify.dev/changelog/posts/product-variant-barcode-is-being-replaced-by-barcodes#compatibility-with-productvariant-barcode)

```js
const variants = readShopifyVariants($input.all().map(item => item.json));
return checkVariants(variants).map(finding => ({ json: finding }));
```

## Typed barcodes from Admin GraphQL

Connect a trigger that produces one item to an **HTTP Request** node. Make a `POST` request to `https://YOUR-STORE.myshopify.com/admin/api/2026-10/graphql.json`. Use your Shopify credential with `read_products` access. For an Admin API access token, you can use an n8n Header Auth credential with header name `X-Shopify-Access-Token`. Keep the token in the credential.

Enable **Send Body**, select **JSON**, and set **Specify Body** to **Using JSON**. Use this body:

```json
{
  "query": "query ShopifyBarcodes($after: String) { productVariants(first: 20, after: $after) { pageInfo { hasNextPage endCursor } nodes { id title sku product { handle title } barcodes(first: 20) { pageInfo { hasNextPage } nodes { type value } } } } }",
  "variables": { "after": null }
}
```

Under **Options → Pagination**, configure the following settings. [n8n HTTP Request pagination](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/#pagination) · [Shopify GraphQL pagination](https://shopify.dev/docs/api/usage/pagination-graphql)

| Setting | Value |
| --- | --- |
| Pagination Mode | Update a Parameter in Each Request |
| Parameter Type | Body |
| Name | `variables` |
| Value (expression) | `{{ ({ after: $response?.body?.data?.productVariants?.pageInfo?.endCursor ?? null }) }}` |
| Pagination Complete When | Other |
| Complete Expression | `{{ $response.body.data?.productVariants?.pageInfo?.hasNextPage !== true }}` |
| Request Interval | 1000 ms |

Connect the HTTP Request node to the Code node. This snippet collects the pages into a single audit, so a barcode repeated across different pages produces a duplicate finding.

```js
const pages = $input.all().map(item => item.json.body ?? item.json);
const connections = pages.map(page => {
  if (page.errors?.length) {
    throw new Error(`Shopify GraphQL request failed: ${page.errors[0].message}`);
  }
  const connection = page.data?.productVariants;
  if (!Array.isArray(connection?.nodes)) {
    throw new Error('Expected a Shopify productVariants page.');
  }
  return connection;
});

if (connections.at(-1)?.pageInfo?.hasNextPage !== false) {
  throw new Error('Fetch all Shopify variant pages before checking for duplicates.');
}

const variants = readShopifyVariants(connections.flatMap(connection => connection.nodes));
return checkVariants(variants).map(finding => ({ json: finding }));
```
