export type TaxProfile = {
  gstRate: number;
  vatRate: number;
  cessRate: number;
  hsnCode?: string;
};

export type TaxBreakdown = {
  taxableAmount: number;
  gstAmount: number;
  vatAmount: number;
  cessAmount: number;
  totalTax: number;
  totalAmount: number;
};

export type PurchaseBatch = {
  purchaseId: string;
  quantity: number;
  purchasePrice: number;
  market: string;
  purchasedAt: string;
  expiresAt?: string;
  tax: TaxBreakdown;
};

export type SaleEntry = {
  saleId: string;
  quantity: number;
  salePrice: number;
  market: string;
  soldAt: string;
  tax: TaxBreakdown;
};

export type InventoryItem = {
  itemId: string;
  name: string;
  category: string;
  unit: string;
  isPerishable: boolean;
  taxProfile: TaxProfile;
  purchases: PurchaseBatch[];
  sales: SaleEntry[];
  createdAt: string;
  updatedAt: string;
};

export type StockSummary = {
  totalPurchased: number;
  totalSold: number;
  currentStock: number;
};

export type ItemWithComputedFields = InventoryItem & StockSummary;

export type CogsValuationMethod = "FIFO" | "WAC";

export type MarginResult = {
  itemId: string;
  name: string;
  category: string;
  method: CogsValuationMethod;
  totalSoldQty: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
};

export const defaultTaxProfile: TaxProfile = {
  gstRate: 0,
  vatRate: 0,
  cessRate: 0,
};

export function summarizeStock(item: InventoryItem): StockSummary {
  const totalPurchased = item.purchases.reduce((sum, row) => sum + row.quantity, 0);
  const totalSold = item.sales.reduce((sum, row) => sum + row.quantity, 0);

  return {
    totalPurchased,
    totalSold,
    currentStock: totalPurchased - totalSold,
  };
}

export function withComputedFields(item: InventoryItem): ItemWithComputedFields {
  return {
    ...item,
    ...summarizeStock(item),
  };
}

export function computeFifoCogs(item: InventoryItem): number {
  const batches = [...item.purchases]
    .sort((a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime())
    .map((p) => ({ remaining: p.quantity, price: p.purchasePrice }));

  let qtyToConsume = item.sales.reduce((sum, s) => sum + s.quantity, 0);
  let cogs = 0;

  for (const batch of batches) {
    if (qtyToConsume <= 0) break;
    const consumed = Math.min(batch.remaining, qtyToConsume);
    cogs += consumed * batch.price;
    qtyToConsume -= consumed;
  }

  return cogs;
}

export function computeWacCogs(item: InventoryItem): number {
  const totalPurchasedQty = item.purchases.reduce((sum, p) => sum + p.quantity, 0);
  if (totalPurchasedQty === 0) return 0;

  const totalPurchaseCost = item.purchases.reduce((sum, p) => sum + p.quantity * p.purchasePrice, 0);
  const wac = totalPurchaseCost / totalPurchasedQty;
  const totalSoldQty = item.sales.reduce((sum, s) => sum + s.quantity, 0);

  return wac * totalSoldQty;
}

export function computeMargin(item: InventoryItem, method: CogsValuationMethod): MarginResult {
  const totalSoldQty = item.sales.reduce((sum, s) => sum + s.quantity, 0);
  const revenue = item.sales.reduce((sum, s) => sum + s.quantity * s.salePrice, 0);
  const cogs = method === "FIFO" ? computeFifoCogs(item) : computeWacCogs(item);
  const grossProfit = revenue - cogs;
  const grossMarginPct = revenue === 0 ? 0 : (grossProfit / revenue) * 100;

  return {
    itemId: item.itemId,
    name: item.name,
    category: item.category,
    method,
    totalSoldQty,
    revenue,
    cogs,
    grossProfit,
    grossMarginPct,
  };
}
