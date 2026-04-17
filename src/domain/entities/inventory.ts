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
