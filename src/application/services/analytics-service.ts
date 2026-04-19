import type { InventoryItem } from "../../domain/entities/inventory";
import { computeMargin, PAYMENT_METHODS, summarizeStock } from "../../domain/entities/inventory";
import type { CogsValuationMethod, MarginResult, PaymentMethod } from "../../domain/entities/inventory";
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

type TaxTotals = {
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

type VendorPerformance = {
  vendorId: string;
  vendorName: string;
  deliveries: number;
  onTimeDeliveries: number;
  reliabilityScore: number;
  averageLeadTimeDays: number;
  averageLeadTimeVarianceDays: number;
};

export class AnalyticsService {
  constructor(private readonly repository: InventoryRepository) {}

  private computeTaxTotals(items: InventoryItem[], fromDate: Date, toDate: Date): TaxTotals {
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

      for (const vendorReturn of item.vendorReturns || []) {
        const date = new Date(vendorReturn.returnedAt);
        if (date >= fromDate && date <= toDate) {
          inGst -= vendorReturn.taxReversal.gstAmount;
          vatIn -= vendorReturn.taxReversal.vatAmount;
          cessIn -= vendorReturn.taxReversal.cessAmount;
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
    };
  }

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
    totals: TaxTotals;
  }> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const items = await this.repository.findAll();
    const totals = this.computeTaxTotals(items, fromDate, toDate);

    return {
      from,
      to,
      totals,
    };
  }

  async getVendorPerformance(from: string, to: string): Promise<{
    from: string;
    to: string;
    vendors: VendorPerformance[];
  }> {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const items = await this.repository.findAll();

    const performanceMap = new Map<
      string,
      {
        vendorName: string;
        deliveries: number;
        onTimeDeliveries: number;
        totalLeadTimeDays: number;
        totalLeadTimeVarianceDays: number;
      }
    >();

    for (const item of items) {
      for (const purchase of item.purchases) {
        if (!purchase.vendorId || !purchase.orderCreatedAt) {
          continue;
        }

        const deliveredAt = new Date(purchase.deliveredAt || purchase.purchasedAt);
        if (deliveredAt < fromDate || deliveredAt > toDate) {
          continue;
        }

        const createdAt = new Date(purchase.orderCreatedAt);
        const promisedAt = purchase.promisedDeliveryAt ? new Date(purchase.promisedDeliveryAt) : null;
        const leadTimeDays = (deliveredAt.getTime() - createdAt.getTime()) / (24 * 3600 * 1000);

        const existing = performanceMap.get(purchase.vendorId) || {
          vendorName: purchase.vendorName || purchase.vendorId,
          deliveries: 0,
          onTimeDeliveries: 0,
          totalLeadTimeDays: 0,
          totalLeadTimeVarianceDays: 0,
        };

        existing.deliveries += 1;
        existing.totalLeadTimeDays += leadTimeDays;

        if (promisedAt) {
          const variance = (deliveredAt.getTime() - promisedAt.getTime()) / (24 * 3600 * 1000);
          existing.totalLeadTimeVarianceDays += variance;
          if (variance <= 0) {
            existing.onTimeDeliveries += 1;
          }
        }

        performanceMap.set(purchase.vendorId, existing);
      }
    }

    const vendors: VendorPerformance[] = [...performanceMap.entries()]
      .map(([vendorId, perf]) => ({
        vendorId,
        vendorName: perf.vendorName,
        deliveries: perf.deliveries,
        onTimeDeliveries: perf.onTimeDeliveries,
        reliabilityScore: perf.deliveries === 0 ? 0 : (perf.onTimeDeliveries / perf.deliveries) * 100,
        averageLeadTimeDays: perf.deliveries === 0 ? 0 : perf.totalLeadTimeDays / perf.deliveries,
        averageLeadTimeVarianceDays:
          perf.deliveries === 0 ? 0 : perf.totalLeadTimeVarianceDays / perf.deliveries,
      }))
      .sort((a, b) => b.reliabilityScore - a.reliabilityScore);

    return {
      from,
      to,
      vendors,
    };
  }

  async getCashFlowProjection(forecastDays: number, demandWindowDays = 30): Promise<{
    generatedAt: string;
    forecastDays: number;
    demandWindowDays: number;
    reorder: {
      totalEstimatedReorderCost: number;
      itemsNeedingReorder: Array<{
        itemId: string;
        name: string;
        category: string;
        currentStock: number;
        lowStockThreshold: number;
        projectedDemandQty: number;
        projectedStock: number;
        requiredQty: number;
        latestPurchasePrice: number;
        estimatedReorderCost: number;
      }>;
    };
    cashRequirementForecast: {
      message: string;
      nextDays: number;
      requiredSpend: number;
    };
    taxLiabilityAccrual: {
      from: string;
      to: string;
      totals: TaxTotals;
    };
  }> {
    const items = await this.repository.findAll();

    const demandByItem = new Map(items.map((item) => [item.itemId, this.calcDemand(item, demandWindowDays)]));
    const itemsNeedingReorder = items
      .map((item) => {
        const stock = summarizeStock(item);
        const threshold = item.lowStockThreshold ?? 0;
        const demand = demandByItem.get(item.itemId);
        const projectedDemandQty = (demand?.saleRatePerDay ?? 0) * forecastDays;
        const projectedStock = stock.currentStock - projectedDemandQty;
        const requiredQty = Math.max(0, threshold - projectedStock);

        const latestPurchase = [...item.purchases].sort(
          (a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime()
        )[0];
        const latestPurchasePrice = latestPurchase?.purchasePrice ?? 0;
        const estimatedReorderCost = requiredQty * latestPurchasePrice;

        return {
          itemId: item.itemId,
          name: item.name,
          category: item.category,
          currentStock: stock.currentStock,
          lowStockThreshold: threshold,
          projectedDemandQty,
          projectedStock,
          requiredQty,
          latestPurchasePrice,
          estimatedReorderCost,
        };
      })
      .filter((item) => item.requiredQty > 0)
      .sort((a, b) => b.estimatedReorderCost - a.estimatedReorderCost);

    const totalEstimatedReorderCost = itemsNeedingReorder.reduce(
      (sum, item) => sum + item.estimatedReorderCost,
      0
    );

    const now = new Date();
    const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    const quarterStart = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1));
    const taxTotals = this.computeTaxTotals(items, quarterStart, now);

    return {
      generatedAt: now.toISOString(),
      forecastDays,
      demandWindowDays,
      reorder: {
        totalEstimatedReorderCost,
        itemsNeedingReorder,
      },
      cashRequirementForecast: {
        message: `Based on current demand trends, you will need to spend ${totalEstimatedReorderCost.toFixed(
          2
        )} on restocking in the next ${forecastDays} days.`,
        nextDays: forecastDays,
        requiredSpend: totalEstimatedReorderCost,
      },
      taxLiabilityAccrual: {
        from: quarterStart.toISOString(),
        to: now.toISOString(),
        totals: taxTotals,
      },
    };
  }

  async getMarginAnalysis(method: CogsValuationMethod): Promise<{
    method: CogsValuationMethod;
    items: MarginResult[];
    summary: {
      totalRevenue: number;
      totalCogs: number;
      totalGrossProfit: number;
      overallGrossMarginPct: number;
    };
  }> {
    const items = await this.repository.findAll();
    const results = items
      .map((item) => computeMargin(item, method))
      .sort((a, b) => b.grossMarginPct - a.grossMarginPct);

    const totalRevenue = results.reduce((sum, r) => sum + r.revenue, 0);
    const totalCogs = results.reduce((sum, r) => sum + r.cogs, 0);
    const totalGrossProfit = totalRevenue - totalCogs;
    const overallGrossMarginPct =
      totalRevenue === 0 ? 0 : (totalGrossProfit / totalRevenue) * 100;

    return {
      method,
      items: results,
      summary: {
        totalRevenue,
        totalCogs,
        totalGrossProfit,
        overallGrossMarginPct,
      },
    };
  }

  async getReconciliation(date: string): Promise<{
    date: string;
    byMethod: Record<PaymentMethod, { totalSales: number; totalRevenue: number }>;
    grandTotal: number;
  }> {
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const items = await this.repository.findAll();

    const byMethod = Object.fromEntries(
      PAYMENT_METHODS.map((m) => [m, { totalSales: 0, totalRevenue: 0 }])
    ) as Record<PaymentMethod, { totalSales: number; totalRevenue: number }>;

    for (const item of items) {
      for (const sale of item.sales) {
        const soldAt = new Date(sale.soldAt);
        if (soldAt < dayStart || soldAt > dayEnd) continue;
        const method = sale.paymentMethod ?? "CASH";
        const saleTotal = sale.quantity * sale.salePrice;
        const collectedAmount = sale.amountPaid ?? saleTotal;
        byMethod[method].totalSales += 1;
        byMethod[method].totalRevenue += collectedAmount;
      }
    }

    const grandTotal = Object.values(byMethod).reduce((sum, m) => sum + m.totalRevenue, 0);

    return { date: dayStart.toISOString().slice(0, 10), byMethod, grandTotal };
  }
}
