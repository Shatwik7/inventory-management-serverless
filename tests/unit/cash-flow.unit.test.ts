import { AnalyticsService } from "../../src/application/services/analytics-service";
import type { InventoryItem } from "../../src/domain/entities/inventory";
import { InMemoryInventoryRepository } from "../helpers/in-memory-repositories";

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    itemId: "item-1",
    name: "Apple",
    category: "fruit",
    unit: "kg",
    lowStockThreshold: 0,
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

describe("AnalyticsService.getCashFlowProjection", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-18T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("estimates reorder cost using demand trend, low-stock threshold, and latest purchase price", async () => {
    const repo = new InMemoryInventoryRepository();

    await repo.create(
      makeItem({
        itemId: "item-a",
        name: "Tomato",
        lowStockThreshold: 20,
        purchases: [
          {
            purchaseId: "p-old",
            quantity: 40,
            purchasePrice: 10,
            market: "m",
            purchasedAt: "2026-04-01T00:00:00.000Z",
            tax: {
              taxableAmount: 400,
              gstAmount: 20,
              vatAmount: 0,
              cessAmount: 0,
              totalTax: 20,
              totalAmount: 420,
            },
          },
          {
            purchaseId: "p-latest",
            quantity: 20,
            purchasePrice: 12,
            market: "m",
            purchasedAt: "2026-04-10T00:00:00.000Z",
            tax: {
              taxableAmount: 240,
              gstAmount: 12,
              vatAmount: 0,
              cessAmount: 0,
              totalTax: 12,
              totalAmount: 252,
            },
          },
        ],
        sales: [
          {
            saleId: "s1",
            quantity: 20,
            salePrice: 20,
            market: "m",
            soldAt: "2026-04-12T00:00:00.000Z",
            paymentMethod: "CASH",
            tax: {
              taxableAmount: 400,
              gstAmount: 20,
              vatAmount: 0,
              cessAmount: 0,
              totalTax: 20,
              totalAmount: 420,
            },
          },
          {
            saleId: "s2",
            quantity: 30,
            salePrice: 20,
            market: "m",
            soldAt: "2026-04-15T00:00:00.000Z",
            paymentMethod: "CASH",
            tax: {
              taxableAmount: 600,
              gstAmount: 30,
              vatAmount: 0,
              cessAmount: 0,
              totalTax: 30,
              totalAmount: 630,
            },
          },
        ],
      })
    );

    await repo.create(
      makeItem({
        itemId: "item-b",
        name: "Potato",
        lowStockThreshold: 5,
        purchases: [
          {
            purchaseId: "p-b",
            quantity: 100,
            purchasePrice: 8,
            market: "m",
            purchasedAt: "2026-04-11T00:00:00.000Z",
            tax: {
              taxableAmount: 800,
              gstAmount: 40,
              vatAmount: 0,
              cessAmount: 0,
              totalTax: 40,
              totalAmount: 840,
            },
          },
        ],
        sales: [
          {
            saleId: "s-b",
            quantity: 20,
            salePrice: 12,
            market: "m",
            soldAt: "2026-04-16T00:00:00.000Z",
            paymentMethod: "CASH",
            tax: {
              taxableAmount: 240,
              gstAmount: 12,
              vatAmount: 0,
              cessAmount: 0,
              totalTax: 12,
              totalAmount: 252,
            },
          },
        ],
      })
    );

    const service = new AnalyticsService(repo);
    const result = await service.getCashFlowProjection(14, 30);

    expect(result.forecastDays).toBe(14);
    expect(result.demandWindowDays).toBe(30);

    // item-a: currentStock = 60 - 50 = 10
    // saleRatePerDay = 50 / 30, projectedDemand(14d) = 23.333..., projectedStock = -13.333...
    // requiredQty = 20 - (-13.333...) = 33.333..., latestPrice = 12
    // estimatedReorderCost ~= 400
    expect(result.reorder.itemsNeedingReorder).toHaveLength(1);
    expect(result.reorder.itemsNeedingReorder[0].itemId).toBe("item-a");
    expect(result.reorder.itemsNeedingReorder[0].latestPurchasePrice).toBe(12);
    expect(result.reorder.itemsNeedingReorder[0].requiredQty).toBeCloseTo(33.3333333, 5);
    expect(result.reorder.itemsNeedingReorder[0].estimatedReorderCost).toBeCloseTo(400, 5);
    expect(result.reorder.totalEstimatedReorderCost).toBeCloseTo(400, 5);

    expect(result.cashRequirementForecast.nextDays).toBe(14);
    expect(result.cashRequirementForecast.requiredSpend).toBeCloseTo(400, 5);
    expect(result.cashRequirementForecast.message).toContain("next 14 days");

    // Quarter accrual (Q2 start = 2026-04-01)
    // inGst = 20 + 12 + 40 = 72, outGst = 20 + 30 + 12 = 62 => netTaxPayable = -10
    expect(result.taxLiabilityAccrual.from).toBe("2026-04-01T00:00:00.000Z");
    expect(result.taxLiabilityAccrual.totals.inGst).toBe(72);
    expect(result.taxLiabilityAccrual.totals.outGst).toBe(62);
    expect(result.taxLiabilityAccrual.totals.netTaxPayable).toBe(-10);
  });
});
