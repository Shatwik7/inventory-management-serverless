import { AnalyticsService } from "../../src/application/services/analytics-service";
import type { InventoryItem } from "../../src/domain/entities/inventory";
import { InMemoryInventoryRepository } from "../helpers/in-memory-repositories";

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    itemId: "item-1",
    name: "Flour",
    category: "grocery",
    unit: "kg",
    lowStockThreshold: 0,
    isPerishable: false,
    taxProfile: { gstRate: 5, vatRate: 0, cessRate: 0 },
    purchases: [],
    sales: [],
    vendorReturns: [],
    vendorSkuMappings: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("AnalyticsService vendor performance and tax reversal", () => {
  it("computes lead-time variance reliability score and reverses input tax from vendor returns", async () => {
    const repo = new InMemoryInventoryRepository();

    await repo.create(
      makeItem({
        purchases: [
          {
            purchaseId: "p1",
            quantity: 10,
            purchasePrice: 100,
            market: "m",
            purchasedAt: "2026-04-03T00:00:00.000Z",
            orderCreatedAt: "2026-04-01T00:00:00.000Z",
            promisedDeliveryAt: "2026-04-03T00:00:00.000Z",
            deliveredAt: "2026-04-03T00:00:00.000Z",
            vendorId: "v1",
            vendorName: "Vendor One",
            tax: {
              taxableAmount: 1000,
              gstAmount: 50,
              vatAmount: 0,
              cessAmount: 0,
              totalTax: 50,
              totalAmount: 1050,
            },
          },
          {
            purchaseId: "p2",
            quantity: 10,
            purchasePrice: 100,
            market: "m",
            purchasedAt: "2026-04-06T00:00:00.000Z",
            orderCreatedAt: "2026-04-04T00:00:00.000Z",
            promisedDeliveryAt: "2026-04-05T00:00:00.000Z",
            deliveredAt: "2026-04-06T00:00:00.000Z",
            vendorId: "v1",
            vendorName: "Vendor One",
            tax: {
              taxableAmount: 1000,
              gstAmount: 50,
              vatAmount: 0,
              cessAmount: 0,
              totalTax: 50,
              totalAmount: 1050,
            },
          },
        ],
        sales: [
          {
            saleId: "s1",
            quantity: 5,
            salePrice: 120,
            market: "m",
            soldAt: "2026-04-07T00:00:00.000Z",
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
        vendorReturns: [
          {
            returnId: "r1",
            vendorId: "v1",
            quantity: 2,
            reason: "FAULTY",
            returnedAt: "2026-04-08T00:00:00.000Z",
            debitNoteNumber: "DN-1",
            creditAmount: 210,
            taxReversal: {
              gstAmount: 10,
              vatAmount: 0,
              cessAmount: 0,
              totalTax: 10,
            },
          },
        ],
      })
    );

    const service = new AnalyticsService(repo);

    const performance = await service.getVendorPerformance(
      "2026-04-01T00:00:00.000Z",
      "2026-04-30T23:59:59.999Z"
    );

    expect(performance.vendors).toHaveLength(1);
    expect(performance.vendors[0].vendorId).toBe("v1");
    expect(performance.vendors[0].deliveries).toBe(2);
    expect(performance.vendors[0].onTimeDeliveries).toBe(1);
    expect(performance.vendors[0].reliabilityScore).toBe(50);
    expect(performance.vendors[0].averageLeadTimeVarianceDays).toBeCloseTo(0.5, 5);

    const taxSummary = await service.getTaxSummary(
      "2026-04-01T00:00:00.000Z",
      "2026-04-30T23:59:59.999Z"
    );

    expect(taxSummary.totals.inGst).toBe(90);
    expect(taxSummary.totals.outGst).toBe(30);
    expect(taxSummary.totals.netTaxPayable).toBe(-60);
  });
});
