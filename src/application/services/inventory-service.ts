import { randomUUID } from "crypto";
import {
  defaultTaxProfile,
  PAYMENT_METHODS,
  summarizeStock,
  withComputedFields,
  type InventoryItem,
  type ItemWithComputedFields,
  type PaymentMethod,
  type TaxProfile,
} from "../../domain/entities/inventory";
import type { InventoryRepository } from "../../domain/ports/inventory-repository";
import { TaxService } from "./tax-service";

type CreateItemInput = {
  name: string;
  category?: string;
  unit?: string;
  isPerishable?: boolean;
  taxProfile?: Partial<TaxProfile>;
};

type AddPurchaseInput = {
  quantity: number;
  purchasePrice: number;
  market?: string;
  purchasedAt?: string;
  expiresAt?: string;
};

type AddSaleInput = {
  quantity: number;
  salePrice: number;
  market?: string;
  soldAt?: string;
  paymentMethod?: PaymentMethod;
};

export class InventoryService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly taxService: TaxService
  ) {}

  async createItem(input: CreateItemInput): Promise<ItemWithComputedFields> {
    const now = new Date().toISOString();

    const item: InventoryItem = {
      itemId: randomUUID(),
      name: input.name.trim(),
      category: input.category?.trim() || "general",
      unit: input.unit?.trim() || "unit",
      isPerishable: Boolean(input.isPerishable),
      taxProfile: {
        ...defaultTaxProfile,
        ...input.taxProfile,
      },
      purchases: [],
      sales: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.create(item);
    return withComputedFields(item);
  }

  async listItems(): Promise<ItemWithComputedFields[]> {
    const items = await this.repository.findAll();
    return items.map(withComputedFields);
  }

  async getItem(itemId: string): Promise<ItemWithComputedFields | null> {
    const item = await this.repository.findById(itemId);
    return item ? withComputedFields(item) : null;
  }

  async addPurchase(itemId: string, input: AddPurchaseInput): Promise<ItemWithComputedFields> {
    const item = await this.repository.findById(itemId);
    if (!item) {
      throw new Error("ITEM_NOT_FOUND");
    }

    if (item.isPerishable && !input.expiresAt) {
      throw new Error("PERISHABLE_EXPIRY_REQUIRED");
    }

    const tax = this.taxService.calculate(input.purchasePrice, input.quantity, item.taxProfile);

    item.purchases.push({
      purchaseId: randomUUID(),
      quantity: input.quantity,
      purchasePrice: input.purchasePrice,
      market: input.market || "unknown",
      purchasedAt: input.purchasedAt || new Date().toISOString(),
      expiresAt: input.expiresAt,
      tax,
    });
    item.updatedAt = new Date().toISOString();

    await this.repository.update(item);
    return withComputedFields(item);
  }

  async addSale(itemId: string, input: AddSaleInput): Promise<ItemWithComputedFields> {
    const item = await this.repository.findById(itemId);
    if (!item) {
      throw new Error("ITEM_NOT_FOUND");
    }

    const stock = summarizeStock(item);
    if (input.quantity > stock.currentStock) {
      throw new Error("INSUFFICIENT_STOCK");
    }

    const tax = this.taxService.calculate(input.salePrice, input.quantity, item.taxProfile);

    const paymentMethod: PaymentMethod = PAYMENT_METHODS.includes(input.paymentMethod as PaymentMethod)
      ? (input.paymentMethod as PaymentMethod)
      : "CASH";

    item.sales.push({
      saleId: randomUUID(),
      quantity: input.quantity,
      salePrice: input.salePrice,
      market: input.market || "unknown",
      soldAt: input.soldAt || new Date().toISOString(),
      paymentMethod,
      tax,
    });
    item.updatedAt = new Date().toISOString();

    await this.repository.update(item);
    return withComputedFields(item);
  }

  async getExpiringItems(days: number): Promise<Array<{
    itemId: string;
    name: string;
    unit: string;
    currentStock: number;
    expiringBatches: InventoryItem["purchases"];
  }>> {
    const now = new Date();
    const upper = new Date();
    upper.setUTCDate(now.getUTCDate() + days);

    const items = await this.repository.findAll();

    return items
      .filter((item) => item.isPerishable)
      .map((item) => {
        const expiringBatches = item.purchases.filter((purchase) => {
          if (!purchase.expiresAt) {
            return false;
          }
          const expDate = new Date(purchase.expiresAt);
          return expDate >= now && expDate <= upper;
        });

        return {
          itemId: item.itemId,
          name: item.name,
          unit: item.unit,
          currentStock: summarizeStock(item).currentStock,
          expiringBatches,
        };
      })
      .filter((row) => row.expiringBatches.length > 0);
  }

  async importItems(items: InventoryItem[]): Promise<void> {
    for (const item of items) {
      const existing = await this.repository.findById(item.itemId);
      if (existing) {
        await this.repository.update(item);
      } else {
        await this.repository.create(item);
      }
    }
  }
}
