import type { InventoryItem } from "../../domain/entities/inventory";
import type { InventoryRepository } from "../../domain/ports/inventory-repository";

type DemandMetric = {
  itemId: string;
  name: string;
  category: string;
  windowDays: number;
  purchasedQty: number;
  soldQty: number;
  saleRatePerDay: number;
  purchaseRatePerDay: number;
  saleToPurchaseRatio: number;
  demandScore: number;
};

export class AnalyticsService {
  constructor(private readonly repository: InventoryRepository) {}

  private calcDemand(item: InventoryItem, windowDays: number): DemandMetric {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);

    const purchases = item.purchases.filter((row) => {
      const date = new Date(row.purchasedAt);
      return date >= cutoff && date <= now;
    });
    const sales = item.sales.filter((row) => {
      const date = new Date(row.soldAt);
      return date >= cutoff && date <= now;
    });

    const purchasedQty = purchases.reduce((sum, row) => sum + row.quantity, 0);
    const soldQty = sales.reduce((sum, row) => sum + row.quantity, 0);

    const saleRatePerDay = soldQty / windowDays;
    const purchaseRatePerDay = purchasedQty / windowDays;
    const saleToPurchaseRatio = purchasedQty === 0 ? soldQty : soldQty / purchasedQty;
    const demandScore = saleRatePerDay * (1 + saleToPurchaseRatio);

    return {
      itemId: item.itemId,
      name: item.name,
      category: item.category,
      windowDays,
      purchasedQty,
      soldQty,
      saleRatePerDay,
      purchaseRatePerDay,
      saleToPurchaseRatio,
      demandScore,
    };
  }

  async getDemand(windowDays: number): Promise<{
    windowDays: number;
    highDemandItems: DemandMetric[];
    lowDemandItems: DemandMetric[];
    allItems: DemandMetric[];
    scoringModel: string;
  }> {
    const items = await this.repository.findAll();
    const metrics = items
      .map((item) => this.calcDemand(item, windowDays))
      .sort((a, b) => b.demandScore - a.demandScore);

    const bucketSize = metrics.length === 0 ? 0 : Math.max(1, Math.ceil(metrics.length * 0.3));

    return {
      windowDays,
      highDemandItems: metrics.slice(0, bucketSize),
      lowDemandItems: [...metrics].reverse().slice(0, bucketSize),
      allItems: metrics,
      scoringModel: "demandScore = saleRatePerDay * (1 + saleToPurchaseRatio)",
    };
  }

  async getTaxSummary(from: string, to: string): Promise<{
    from: string;
    to: string;
    totals: {
      inGst: number;
      outGst: number;
      gstPayable: number;
      vatIn: number;
      vatOut: number;
      vatPayable: number;
      cessIn: number;
      cessOut: number;
      cessPayable: number;
      grossInputTax: number;
      grossOutputTax: number;
      netTaxPayable: number;
    };
  }> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const items = await this.repository.findAll();

    let inGst = 0;
    let outGst = 0;
    let vatIn = 0;
    let vatOut = 0;
    let cessIn = 0;
    let cessOut = 0;

    for (const item of items) {
      for (const purchase of item.purchases) {
        const date = new Date(purchase.purchasedAt);
        if (date >= fromDate && date <= toDate) {
          inGst += purchase.tax.gstAmount;
          vatIn += purchase.tax.vatAmount;
          cessIn += purchase.tax.cessAmount;
        }
      }

      for (const sale of item.sales) {
        const date = new Date(sale.soldAt);
        if (date >= fromDate && date <= toDate) {
          outGst += sale.tax.gstAmount;
          vatOut += sale.tax.vatAmount;
          cessOut += sale.tax.cessAmount;
        }
      }
    }

    const gstPayable = outGst - inGst;
    const vatPayable = vatOut - vatIn;
    const cessPayable = cessOut - cessIn;

    return {
      from,
      to,
      totals: {
        inGst,
        outGst,
        gstPayable,
        vatIn,
        vatOut,
        vatPayable,
        cessIn,
        cessOut,
        cessPayable,
        grossInputTax: inGst + vatIn + cessIn,
        grossOutputTax: outGst + vatOut + cessOut,
        netTaxPayable: gstPayable + vatPayable + cessPayable,
      },
    };
  }
}
