# Shop Inventory API (TypeScript + Hexagonal)

This API is designed as a one-shop inventory system (single owner account), not a multi-vendor platform.

Implemented features:

- TypeScript codebase for robustness.
- Hexagonal architecture with clear layers:
  - domain
  - application services
  - infrastructure adapters
  - http controllers
  - modules/composition
- Single-owner authentication:
  - only first registration is allowed
  - JWT-protected private routes
- Inventory with market-based fluctuating purchase/sale prices.
- Perishable expiry tracking.
- Demand trend analytics (high/low demand).
- Excel import/export.
- Taxation support:
  - GST (input and output)
  - VAT (input and output)
  - cess
  - period-wise tax summary and net payable.

## Project Structure

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
```

```bash
npm run check
```

```bash
npx serverless dev
```

For deployment, set a secure secret:

```bash
export AUTH_JWT_SECRET="replace-with-long-random-secret"
npx serverless deploy
```

## Authentication Flow

1. Register owner once:

```http
POST /auth/register-owner
```

Body:

```json
{
  "username": "shopadmin",
  "password": "StrongPassword123"
}
```

1. Login:

```http
POST /auth/login
```

1. Use bearer token for all private APIs:

```text
Authorization: Bearer <token>
```

## Inventory + Taxation Data Model

Each item has tax profile:

- gstRate
- vatRate
- cessRate
- hsnCode (optional)

Tax per transaction:

```text
taxableAmount = unitPrice * quantity
gstAmount = taxableAmount * gstRate / 100
vatAmount = taxableAmount * vatRate / 100
cessAmount = taxableAmount * cessRate / 100
totalTax = gstAmount + vatAmount + cessAmount
totalAmount = taxableAmount + totalTax
```

Purchase tax contributes to input taxes (in GST/VAT/cess).
Sale tax contributes to output taxes (out GST/VAT/cess).

## API Endpoints

Public:

- GET /
- POST /auth/register-owner
- POST /auth/login

Private:

- POST /items
- GET /items
- GET /items/{itemId}
- POST /items/{itemId}/purchases
- POST /items/{itemId}/sales
- GET /inventory/expiring?days=7
- GET /analytics/demand?windowDays=30
- GET /analytics/tax-summary?from=ISO_DATE&to=ISO_DATE
- GET /inventory/export
- POST /inventory/import

## Excel Import and Export

Export:

- GET /inventory/export
- Response contains base64 xlsx content (`workbookBase64`) and file metadata.

Import:

- POST /inventory/import
- Body:

```json
{
  "fileBase64": "<base64 xlsx>"
}
```

Workbook sheets expected:

- Items
- Purchases
- Sales

## Tax Summary Example

```http
GET /analytics/tax-summary?from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.000Z
```

Returns:

- inGst, outGst, gstPayable
- vatIn, vatOut, vatPayable
- cessIn, cessOut, cessPayable
- grossInputTax, grossOutputTax, netTaxPayable
