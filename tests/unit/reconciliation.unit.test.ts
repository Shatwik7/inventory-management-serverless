import { AnalyticsService } from "../../src/application/services/analytics-service";
import type { InventoryItem } from "../../src/domain/entities/inventory";
import { InMemoryInventoryRepository } from "../helpers/in-memory-repositories";

const TAX_ZERO = {
  taxableAmount: 0,
  gstAmount: 0,
  vatAmount: 0,
  cessAmount: 0,
  totalTax: 0,
  totalAmount: 0,
};

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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("AnalyticsService.getReconciliation", () => {
  const TARGET_DATE = "2026-04-18";

  it("returns all zero buckets when no sales", async () => {
    const repo = new InMemoryInventoryRepository();
    await repo.create(makeItem());

    const service = new AnalyticsService(repo);
    const result = await service.getReconciliation(TARGET_DATE);

    expect(result.date).toBe(TARGET_DATE);
    expect(result.grandTotal).toBe(0);
    expect(result.byMethod.CASH.totalRevenue).toBe(0);
    expect(result.byMethod.UPI.totalRevenue).toBe(0);
    expect(result.byMethod.CARD.totalRevenue).toBe(0);
    expect(result.byMethod.CREDIT.totalRevenue).toBe(0);
  });

  it("correctly buckets sales by payment method on the given date", async () => {
    const repo = new InMemoryInventoryRepository();
    await repo.create(
      makeItem({
        sales: [
          // CASH: 5 × $90 = $450
          {
            saleId: "s1",
            quantity: 5,
            salePrice: 90,
            market: "m",
            soldAt: "2026-04-18T08:00:00.000Z",
            paymentMethod: "CASH",
            tax: TAX_ZERO,
          },
          // UPI: 3 × $400 = $1200
          {
            saleId: "s2",
            quantity: 3,
            salePrice: 400,
            market: "m",
            soldAt: "2026-04-18T12:00:00.000Z",
            paymentMethod: "UPI",
            tax: TAX_ZERO,
          },
          // CARD: 2 × $50 = $100
          {
            saleId: "s3",
            quantity: 2,
            salePrice: 50,
            market: "m",
            soldAt: "2026-04-18T18:00:00.000Z",
            paymentMethod: "CARD",
            tax: TAX_ZERO,
          },
        ],
      })
    );

    const service = new AnalyticsService(repo);
    const result = await service.getReconciliation(TARGET_DATE);

    expect(result.byMethod.CASH.totalSales).toBe(1);
    expect(result.byMethod.CASH.totalRevenue).toBe(450);

    expect(result.byMethod.UPI.totalSales).toBe(1);
    expect(result.byMethod.UPI.totalRevenue).toBe(1200);

    expect(result.byMethod.CARD.totalSales).toBe(1);
    expect(result.byMethod.CARD.totalRevenue).toBe(100);

    expect(result.byMethod.CREDIT.totalSales).toBe(0);
    expect(result.byMethod.CREDIT.totalRevenue).toBe(0);

    expect(result.grandTotal).toBe(1750);
  });

  it("excludes sales from other dates", async () => {
    const repo = new InMemoryInventoryRepository();
    await repo.create(
      makeItem({
        sales: [
          {
            saleId: "s1",
            quantity: 10,
            salePrice: 100,
            market: "m",
            soldAt: "2026-04-17T23:59:59.000Z",  // day before — excluded
            paymentMethod: "CASH",
            tax: TAX_ZERO,
          },
          {
            saleId: "s2",
            quantity: 2,
            salePrice: 50,
            market: "m",
            soldAt: "2026-04-18T00:00:00.000Z",  // target day — included
            paymentMethod: "UPI",
            tax: TAX_ZERO,
          },
          {
            saleId: "s3",
            quantity: 1,
            salePrice: 200,
            market: "m",
            soldAt: "2026-04-19T00:00:00.000Z",  // day after — excluded
            paymentMethod: "CASH",
            tax: TAX_ZERO,
          },
        ],
      })
    );

    const service = new AnalyticsService(repo);
    const result = await service.getReconciliation(TARGET_DATE);

    expect(result.byMethod.CASH.totalRevenue).toBe(0);
    expect(result.byMethod.UPI.totalRevenue).toBe(100);
    expect(result.grandTotal).toBe(100);
  });

  it("aggregates sales across multiple items", async () => {
    const repo = new InMemoryInventoryRepository();
    await repo.create(
      makeItem({
        itemId: "item-a",
        sales: [
          {
            saleId: "s1",
            quantity: 1,
            salePrice: 200,
            market: "m",
            soldAt: "2026-04-18T10:00:00.000Z",
            paymentMethod: "CASH",
            tax: TAX_ZERO,
          },
        ],
      })
    );
    await repo.create(
      makeItem({
        itemId: "item-b",
        sales: [
          {
            saleId: "s2",
            quantity: 1,
            salePrice: 300,
            market: "m",
            soldAt: "2026-04-18T11:00:00.000Z",
            paymentMethod: "CASH",
            tax: TAX_ZERO,
          },
        ],
      })
    );

    const service = new AnalyticsService(repo);
    const result = await service.getReconciliation(TARGET_DATE);

    expect(result.byMethod.CASH.totalSales).toBe(2);
    expect(result.byMethod.CASH.totalRevenue).toBe(500);
    expect(result.grandTotal).toBe(500);
  });
});
