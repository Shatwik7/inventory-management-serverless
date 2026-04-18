# Shop Inventory API

TypeScript serverless API for a single-owner shop inventory system built with hexagonal architecture.

## Feature Summary

- Single-owner authentication with JWT-protected private routes
- Inventory management with purchases, sales, and computed stock
- Perishable batch expiry tracking
- Taxation support for GST, VAT, and cess
- Excel import/export for items, purchases, and sales
- Demand trend analytics
- COGS and margin analysis with FIFO or WAC valuation
- Multi-payment reconciliation by mode: CASH, UPI, CARD, CREDIT
- Khata / receivables ledger with customer debt tracking and payment recording
- Cash-flow and burn-rate projection using demand trends and low-stock thresholds

## Architecture

```text
src/
  domain/
    entities/
    ports/
  application/
    services/
  infrastructure/
    dynamodb/
    security/
    excel/
  interfaces/
    http/controllers/
  modules/
  lambda.ts
  router.ts
```

## Setup

```bash
npm install
npm run check
npx serverless dev
```

For deployment:

```bash
export AUTH_JWT_SECRET="replace-with-long-random-secret"
npx serverless deploy
```

## Auth Model

- Public routes:
  - `GET /`
  - `POST /auth/register-owner`
  - `POST /auth/login`
- All other routes require:

```text
Authorization: Bearer <token>
```

## Common Contract

### Error response

```json
{
  "error": "human readable message"
}
```

### TaxProfile

```json
{
  "gstRate": 5,
  "vatRate": 0,
  "cessRate": 0,
  "hsnCode": "optional-string"
}
```

### TaxBreakdown

```json
{
  "taxableAmount": 200,
  "gstAmount": 10,
  "vatAmount": 0,
  "cessAmount": 0,
  "totalTax": 10,
  "totalAmount": 210
}
```

### PurchaseBatch

```json
{
  "purchaseId": "uuid",
  "quantity": 100,
  "purchasePrice": 20,
  "market": "wholesale-market",
  "purchasedAt": "2026-04-18T10:00:00.000Z",
  "expiresAt": "2026-04-25T00:00:00.000Z",
  "tax": {}
}
```

### SaleEntry

```json
{
  "saleId": "uuid",
  "quantity": 5,
  "salePrice": 100,
  "market": "storefront",
  "soldAt": "2026-04-18T11:00:00.000Z",
  "paymentMethod": "CASH",
  "paymentStatus": "PAID",
  "amountPaid": 500,
  "outstandingAmount": 0,
  "customerId": "cust-1",
  "customerName": "Ravi",
  "tax": {}
}
```

Valid `paymentMethod` values:

- `CASH`
- `UPI`
- `CARD`
- `CREDIT`

Valid `paymentStatus` values:

- `PAID`
- `UNPAID`
- `PARTIALLY_PAID`

### InventoryItem

```json
{
  "itemId": "uuid",
  "name": "Tomato",
  "category": "vegetable",
  "unit": "kg",
  "lowStockThreshold": 20,
  "isPerishable": true,
  "taxProfile": {},
  "purchases": [],
  "sales": [],
  "createdAt": "2026-04-18T10:00:00.000Z",
  "updatedAt": "2026-04-18T10:00:00.000Z",
  "totalPurchased": 100,
  "totalSold": 30,
  "currentStock": 70
}
```

### Customer

```json
{
  "customerId": "cust-1",
  "name": "Ravi",
  "currentBalance": 1200,
  "payments": [
    {
      "paymentId": "uuid",
      "amount": 300,
      "paidAt": "2026-04-18T13:00:00.000Z",
      "note": "cash settlement"
    }
  ],
  "createdAt": "2026-04-01T00:00:00.000Z",
  "updatedAt": "2026-04-18T13:00:00.000Z"
}
```

## API Contract

### `GET /`

Returns service metadata and route list.

Response `200`:

```json
{
  "service": "shop-inventory-api",
  "status": "ok",
  "architecture": "hexagonal",
  "endpoints": ["POST /auth/register-owner"]
}
```

### `POST /auth/register-owner`

Register the single owner account. Allowed only once.

Request body:

```json
{
  "username": "shopadmin",
  "password": "StrongPassword123"
}
```

Response `201`:

```json
{
  "message": "owner registered successfully",
  "owner": {
    "username": "shopadmin"
  }
}
```

Error cases:

- `400` missing username/password
- `403` owner already exists

### `POST /auth/login`

Request body:

```json
{
  "username": "shopadmin",
  "password": "StrongPassword123"
}
```

Response `200`:

```json
{
  "token": "jwt-token"
}
```

Error cases:

- `401` invalid credentials
- `401` owner is not registered yet

### `POST /items`

Create an inventory item.

Request body:

```json
{
  "name": "Tomato",
  "category": "vegetable",
  "unit": "kg",
  "lowStockThreshold": 20,
  "isPerishable": true,
  "taxProfile": {
    "gstRate": 5,
    "vatRate": 0,
    "cessRate": 0,
    "hsnCode": "0702"
  }
}
```

Response `201`:

```json
{
  "itemId": "uuid",
  "name": "Tomato",
  "category": "vegetable",
  "unit": "kg",
  "lowStockThreshold": 20,
  "isPerishable": true,
  "taxProfile": {},
  "purchases": [],
  "sales": [],
  "createdAt": "2026-04-18T10:00:00.000Z",
  "updatedAt": "2026-04-18T10:00:00.000Z",
  "totalPurchased": 0,
  "totalSold": 0,
  "currentStock": 0
}
```

Notes:

- `name` is required
- `lowStockThreshold` defaults to `0`
- `category` defaults to `general`
- `unit` defaults to `unit`
- tax rates default to `0`

### `GET /items`

List all items.

Response `200`:

```json
{
  "items": [
    {}
  ]
}
```

Each element in `items` follows the `InventoryItem` response contract above.

### `GET /items/{itemId}`

Fetch one item by id.

Response `200`:

```json
{}
```

The response body is one `InventoryItem`.

Error cases:

- `404` item not found

### `POST /items/{itemId}/purchases`

Add a purchase batch.

Request body:

```json
{
  "quantity": 100,
  "purchasePrice": 20,
  "market": "wholesale-market",
  "purchasedAt": "2026-04-18T08:00:00.000Z",
  "expiresAt": "2026-04-25T00:00:00.000Z"
}
```

Response `200`:

```json
{}
```

The response body is the updated `InventoryItem`.

Error cases:

- `404` item not found
- `400` invalid quantity or purchasePrice
- `400` `expiresAt` required for perishable items

### `POST /items/{itemId}/sales`

Record a sale. Supports fully paid, unpaid, or partially paid sales.

Request body:

```json
{
  "quantity": 5,
  "salePrice": 100,
  "market": "storefront",
  "soldAt": "2026-04-18T11:00:00.000Z",
  "paymentMethod": "CREDIT",
  "paymentStatus": "PARTIALLY_PAID",
  "amountPaid": 200,
  "customerId": "cust-1",
  "customerName": "Ravi"
}
```

Rules:

- `quantity` and `salePrice` are required
- `paymentMethod` defaults to `CASH`
- `paymentStatus` defaults to `PAID`
- if sale is unpaid or partially paid, `customerId` is required
- `amountPaid` must be between `0` and `quantity * salePrice`

Response `200`:

```json
{}
```

The response body is the updated `InventoryItem`.

Error cases:

- `404` item not found
- `400` insufficient stock
- `400` invalid `amountPaid`
- `400` missing `customerId` for credit sale

### `GET /inventory/expiring?days=7`

List perishable batches expiring within the next `days` days.

Response `200`:

```json
{
  "days": 7,
  "expiring": [
    {
      "itemId": "uuid",
      "name": "Milk",
      "unit": "ltr",
      "currentStock": 10,
      "expiringBatches": [
        {}
      ]
    }
  ]
}
```

### `GET /inventory/export`

Export inventory workbook.

Response `200`:

```json
{
  "fileName": "shop-inventory-2026-04-18.xlsx",
  "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "workbookBase64": "base64-string"
}
```

### `POST /inventory/import`

Import workbook data.

Request body:

```json
{
  "fileBase64": "base64-string"
}
```

Response `200`:

```json
{
  "message": "inventory imported",
  "itemsImported": 2,
  "purchasesImported": 10,
  "salesImported": 8
}
```

Workbook sheets:

- `Items`
- `Purchases`
- `Sales`

### `GET /analytics/demand?windowDays=30`

Return demand trend analytics using sales and purchases from the last `windowDays` days.

Response `200`:

```json
{
  "windowDays": 30,
  "highDemandItems": [
    {
      "itemId": "uuid",
      "name": "Tomato",
      "category": "vegetable",
      "windowDays": 30,
      "purchasedQty": 100,
      "soldQty": 80,
      "saleRatePerDay": 2.6666666667,
      "purchaseRatePerDay": 3.3333333333,
      "saleToPurchaseRatio": 0.8,
      "demandScore": 4.8
    }
  ],
  "lowDemandItems": [],
  "allItems": [],
  "scoringModel": "demandScore = saleRatePerDay * (1 + saleToPurchaseRatio)"
}
```

### `GET /analytics/tax-summary?from=ISO_DATE&to=ISO_DATE`

Return tax totals for a date range. If omitted, defaults to current month-to-date.

Response `200`:

```json
{
  "from": "2026-04-01T00:00:00.000Z",
  "to": "2026-04-18T12:00:00.000Z",
  "totals": {
    "inGst": 72,
    "outGst": 62,
    "gstPayable": -10,
    "vatIn": 0,
    "vatOut": 0,
    "vatPayable": 0,
    "cessIn": 0,
    "cessOut": 0,
    "cessPayable": 0,
    "grossInputTax": 72,
    "grossOutputTax": 62,
    "netTaxPayable": -10
  }
}
```

### `GET /analytics/margin?method=FIFO|WAC`

Return COGS and gross margin analysis by item.

Query params:

- `method`: `FIFO` or `WAC`, default `FIFO`

Response `200`:

```json
{
  "method": "FIFO",
  "items": [
    {
      "itemId": "uuid",
      "name": "Apple",
      "category": "fruit",
      "method": "FIFO",
      "totalSoldQty": 12,
      "revenue": 24,
      "cogs": 12.4,
      "grossProfit": 11.6,
      "grossMarginPct": 48.3333333333
    }
  ],
  "summary": {
    "totalRevenue": 24,
    "totalCogs": 12.4,
    "totalGrossProfit": 11.6,
    "overallGrossMarginPct": 48.3333333333
  }
}
```

### `GET /analytics/reconciliation?date=2026-04-18`

Return daily sales reconciliation by payment mode.

Response `200`:

```json
{
  "date": "2026-04-18",
  "byMethod": {
    "CASH": { "totalSales": 1, "totalRevenue": 450 },
    "UPI": { "totalSales": 1, "totalRevenue": 1200 },
    "CARD": { "totalSales": 0, "totalRevenue": 0 },
    "CREDIT": { "totalSales": 0, "totalRevenue": 0 }
  },
  "grandTotal": 1650
}
```

Notes:

- `totalRevenue` reflects collected amount, using `amountPaid` when present
- if `date` is omitted, current date is used

### `GET /analytics/cash-flow?forecastDays=14&demandWindowDays=30`

Return forecasted restocking cash need and current-quarter tax liability accrual.

Query params:

- `forecastDays`: positive integer, default `14`
- `demandWindowDays`: positive integer, default `30`

Response `200`:

```json
{
  "generatedAt": "2026-04-18T12:00:00.000Z",
  "forecastDays": 14,
  "demandWindowDays": 30,
  "reorder": {
    "totalEstimatedReorderCost": 2500,
    "itemsNeedingReorder": [
      {
        "itemId": "uuid",
        "name": "Tomato",
        "category": "vegetable",
        "currentStock": 10,
        "lowStockThreshold": 20,
        "projectedDemandQty": 33.3333333333,
        "projectedStock": -23.3333333333,
        "requiredQty": 43.3333333333,
        "latestPurchasePrice": 12,
        "estimatedReorderCost": 520
      }
    ]
  },
  "cashRequirementForecast": {
    "message": "Based on current demand trends, you will need to spend 2500.00 on restocking in the next 14 days.",
    "nextDays": 14,
    "requiredSpend": 2500
  },
  "taxLiabilityAccrual": {
    "from": "2026-04-01T00:00:00.000Z",
    "to": "2026-04-18T12:00:00.000Z",
    "totals": {
      "inGst": 72,
      "outGst": 62,
      "gstPayable": -10,
      "vatIn": 0,
      "vatOut": 0,
      "vatPayable": 0,
      "cessIn": 0,
      "cessOut": 0,
      "cessPayable": 0,
      "grossInputTax": 72,
      "grossOutputTax": 62,
      "netTaxPayable": -10
    }
  }
}
```

### `GET /finance/receivables?date=2026-04-18`

Return all debtors and aging buckets as of a date.

Response `200`:

```json
{
  "date": "2026-04-18",
  "debtors": [
    {
      "customerId": "cust-1",
      "customerName": "Ravi",
      "currentBalance": 350,
      "outstandingInvoices": 3,
      "oldestDueDate": "2026-01-01T00:00:00.000Z",
      "aging": {
        "bucket0To30": 100,
        "bucket31To60": 150,
        "bucket61Plus": 100
      }
    }
  ],
  "totals": {
    "bucket0To30": 100,
    "bucket31To60": 150,
    "bucket61Plus": 100,
    "totalOutstanding": 350,
    "totalDebtors": 1
  }
}
```

### `POST /customers/{id}/payments`

Record a customer repayment. Payments are applied to oldest outstanding invoices first.

Request body:

```json
{
  "amount": 200,
  "paidAt": "2026-04-18T09:00:00.000Z",
  "note": "part payment"
}
```

Response `200`:

```json
{
  "customer": {
    "customerId": "cust-1",
    "name": "Ravi",
    "currentBalance": 100,
    "payments": [
      {
        "paymentId": "uuid",
        "amount": 200,
        "paidAt": "2026-04-18T09:00:00.000Z",
        "note": "part payment"
      }
    ],
    "createdAt": "2026-04-01T00:00:00.000Z",
    "updatedAt": "2026-04-18T09:00:00.000Z"
  },
  "appliedAmount": 200,
  "unappliedAmount": 0
}
```

Error cases:

- `404` customer not found
- `400` amount must be greater than `0`

## Defaults and Behavior Notes

- `category` defaults to `general`
- `unit` defaults to `unit`
- `lowStockThreshold` defaults to `0`
- `paymentMethod` defaults to `CASH`
- `paymentStatus` defaults to `PAID`
- partially paid and unpaid sales create or update customer receivables
- reconciliation uses collected amount, not always full invoice amount
- cash-flow forecast uses latest purchase price for reorder estimation
- tax accrual in cash-flow projection is quarter-to-date
