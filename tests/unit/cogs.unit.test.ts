import { computeFifoCogs, computeMargin, computeWacCogs } from "../../src/domain/entities/inventory";
import type { InventoryItem } from "../../src/domain/entities/inventory";

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    itemId: "item-1",
    name: "Apple",
    category: "fruit",
    unit: "kg",
    isPerishable: false,
    taxProfile: { gstRate: 0, vatRate: 0, cessRate: 0 },
    purchases: [],
    sales: [],
    vendorReturns: [],
    vendorSkuMappings: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeFifoCogs", () => {
  it("returns 0 when no sales", () => {
    const item = makeItem({
      purchases: [{ purchaseId: "p1", quantity: 10, purchasePrice: 1, market: "m", purchasedAt: "2026-01-01T00:00:00.000Z", tax: { taxableAmount: 10, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 10 } }],
      sales: [],
    });
    expect(computeFifoCogs(item)).toBe(0);
  });

  it("returns 0 when no purchases", () => {
    const item = makeItem({ purchases: [], sales: [] });
    expect(computeFifoCogs(item)).toBe(0);
  });

  it("uses oldest batches first (FIFO)", () => {
    // Buy 10 @ $1 then 10 @ $1.20; sell 12 → COGS = (10 * 1) + (2 * 1.20) = $12.40
    const item = makeItem({
      purchases: [
        {
          purchaseId: "p1",
          quantity: 10,
          purchasePrice: 1,
          market: "m",
          purchasedAt: "2026-01-01T00:00:00.000Z",
          tax: { taxableAmount: 10, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 10 },
        },
        {
          purchaseId: "p2",
          quantity: 10,
          purchasePrice: 1.2,
          market: "m",
          purchasedAt: "2026-01-10T00:00:00.000Z",
          tax: { taxableAmount: 12, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 12 },
        },
      ],
      sales: [
        {
          saleId: "s1",
          quantity: 12,
          salePrice: 2,
          market: "m",
          soldAt: "2026-01-15T00:00:00.000Z",
          tax: { taxableAmount: 24, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 24 },
        },
      ],
    });
    expect(computeFifoCogs(item)).toBeCloseTo(12.4);
  });

  it("handles sale quantity exactly equal to total purchased", () => {
    const item = makeItem({
      purchases: [
        {
          purchaseId: "p1",
          quantity: 5,
          purchasePrice: 2,
          market: "m",
          purchasedAt: "2026-01-01T00:00:00.000Z",
          tax: { taxableAmount: 10, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 10 },
        },
      ],
      sales: [
        {
          saleId: "s1",
          quantity: 5,
          salePrice: 3,
          market: "m",
          soldAt: "2026-01-05T00:00:00.000Z",
          tax: { taxableAmount: 15, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 15 },
        },
      ],
    });
    expect(computeFifoCogs(item)).toBe(10);
  });

  it("orders purchases by date not insertion order", () => {
    // Inserted in reverse order; FIFO should still use oldest (p2) first
    const item = makeItem({
      purchases: [
        {
          purchaseId: "p1",
          quantity: 10,
          purchasePrice: 2,
          market: "m",
          purchasedAt: "2026-02-01T00:00:00.000Z",
          tax: { taxableAmount: 20, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 20 },
        },
        {
          purchaseId: "p2",
          quantity: 10,
          purchasePrice: 1,
          market: "m",
          purchasedAt: "2026-01-01T00:00:00.000Z",
          tax: { taxableAmount: 10, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 10 },
        },
      ],
      sales: [
        {
          saleId: "s1",
          quantity: 10,
          salePrice: 3,
          market: "m",
          soldAt: "2026-03-01T00:00:00.000Z",
          tax: { taxableAmount: 30, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 30 },
        },
      ],
    });
    // Oldest batch is p2 @ $1; selling 10 → COGS = 10
    expect(computeFifoCogs(item)).toBe(10);
  });
});

describe("computeWacCogs", () => {
  it("returns 0 when no purchases", () => {
    const item = makeItem({ purchases: [], sales: [] });
    expect(computeWacCogs(item)).toBe(0);
  });

  it("calculates WAC correctly", () => {
    // 10 @ $1 + 10 @ $1.20 → WAC = (10 + 12) / 20 = $1.10; sell 12 → COGS = 13.20
    const item = makeItem({
      purchases: [
        {
          purchaseId: "p1",
          quantity: 10,
          purchasePrice: 1,
          market: "m",
          purchasedAt: "2026-01-01T00:00:00.000Z",
          tax: { taxableAmount: 10, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 10 },
        },
        {
          purchaseId: "p2",
          quantity: 10,
          purchasePrice: 1.2,
          market: "m",
          purchasedAt: "2026-01-10T00:00:00.000Z",
          tax: { taxableAmount: 12, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 12 },
        },
      ],
      sales: [
        {
          saleId: "s1",
          quantity: 12,
          salePrice: 2,
          market: "m",
          soldAt: "2026-01-15T00:00:00.000Z",
          tax: { taxableAmount: 24, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 24 },
        },
      ],
    });
    expect(computeWacCogs(item)).toBeCloseTo(13.2);
  });
});

describe("computeMargin", () => {
  const purchases = [
    {
      purchaseId: "p1",
      quantity: 10,
      purchasePrice: 1,
      market: "m",
      purchasedAt: "2026-01-01T00:00:00.000Z",
      tax: { taxableAmount: 10, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 10 },
    },
    {
      purchaseId: "p2",
      quantity: 10,
      purchasePrice: 1.2,
      market: "m",
      purchasedAt: "2026-01-10T00:00:00.000Z",
      tax: { taxableAmount: 12, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 12 },
    },
  ];

  const sales = [
    {
      saleId: "s1",
      quantity: 12,
      salePrice: 2,
      market: "m",
      soldAt: "2026-01-15T00:00:00.000Z",
      tax: { taxableAmount: 24, gstAmount: 0, vatAmount: 0, cessAmount: 0, totalTax: 0, totalAmount: 24 },
    },
  ];

  it("computes FIFO margin: revenue=24, cogs=12.40, grossProfit=11.60, margin≈48.33%", () => {
    const item = makeItem({ purchases, sales });
    const result = computeMargin(item, "FIFO");

    expect(result.method).toBe("FIFO");
    expect(result.totalSoldQty).toBe(12);
    expect(result.revenue).toBeCloseTo(24);
    expect(result.cogs).toBeCloseTo(12.4);
    expect(result.grossProfit).toBeCloseTo(11.6);
    expect(result.grossMarginPct).toBeCloseTo((11.6 / 24) * 100);
  });

  it("computes WAC margin: revenue=24, cogs=13.20, grossProfit=10.80, margin=45%", () => {
    const item = makeItem({ purchases, sales });
    const result = computeMargin(item, "WAC");

    expect(result.method).toBe("WAC");
    expect(result.revenue).toBeCloseTo(24);
    expect(result.cogs).toBeCloseTo(13.2);
    expect(result.grossProfit).toBeCloseTo(10.8);
    expect(result.grossMarginPct).toBeCloseTo(45);
  });

  it("returns 0% margin and 0 cogs when no sales", () => {
    const item = makeItem({ purchases, sales: [] });
    const result = computeMargin(item, "FIFO");

    expect(result.revenue).toBe(0);
    expect(result.cogs).toBe(0);
    expect(result.grossProfit).toBe(0);
    expect(result.grossMarginPct).toBe(0);
  });

  it("correctly maps item metadata", () => {
    const item = makeItem({ purchases, sales });
    const result = computeMargin(item, "WAC");

    expect(result.itemId).toBe("item-1");
    expect(result.name).toBe("Apple");
    expect(result.category).toBe("fruit");
  });
});
