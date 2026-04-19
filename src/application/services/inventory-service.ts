import { randomUUID } from "crypto";
import {
  defaultTaxProfile,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  summarizeStock,
  withComputedFields,
  type InventoryItem,
  type ItemWithComputedFields,
  type PaymentMethod,
  type PaymentStatus,
  type TaxProfile,
  type VendorReturnEntry,
} from "../../domain/entities/inventory";
import type { Customer } from "../../domain/entities/customer";
import type { CustomerRepository } from "../../domain/ports/customer-repository";
import type { InventoryRepository } from "../../domain/ports/inventory-repository";
import { TaxService } from "./tax-service";

type CreateItemInput = {
  name: string;
  category?: string;
  unit?: string;
  lowStockThreshold?: number;
  isPerishable?: boolean;
  taxProfile?: Partial<TaxProfile>;
};

type AddPurchaseInput = {
  quantity: number;
  purchasePrice: number;
  market?: string;
  purchasedAt?: string;
  deliveredAt?: string;
  orderCreatedAt?: string;
  promisedDeliveryAt?: string;
  vendorId?: string;
  vendorName?: string;
  paymentStatus?: PaymentStatus;
  amountPaid?: number;
  expiresAt?: string;
};

type AddSaleInput = {
  quantity: number;
  salePrice: number;
  market?: string;
  soldAt?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  amountPaid?: number;
  customerId?: string;
  customerName?: string;
};

type ReturnToVendorInput = {
  quantity: number;
  vendorId: string;
  vendorName?: string;
  returnedAt?: string;
  reason?: VendorReturnEntry["reason"];
  note?: string;
  debitNoteNumber?: string;
};

type UpsertVendorSkuMappingInput = {
  vendorId: string;
  vendorSku: string;
  vendorItemName?: string;
};

export class InventoryService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly taxService: TaxService,
    private readonly customerRepository?: CustomerRepository
  ) {}

  private ensureVendorCollections(item: InventoryItem): void {
    if (!item.vendorReturns) {
      item.vendorReturns = [];
    }
    if (!item.vendorSkuMappings) {
      item.vendorSkuMappings = [];
    }
  }

  private normalizePayment(
    totalAmount: number,
    paymentStatus?: PaymentStatus,
    amountPaid?: number
  ): { paymentStatus: PaymentStatus; amountPaid: number; outstandingAmount: number } {
    const normalizedStatus: PaymentStatus = PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)
      ? (paymentStatus as PaymentStatus)
      : "PAID";

    const providedAmountPaid = amountPaid ?? (normalizedStatus === "PAID" ? totalAmount : 0);
    if (providedAmountPaid < 0 || providedAmountPaid > totalAmount) {
      throw new Error("INVALID_AMOUNT_PAID");
    }

    let finalStatus = normalizedStatus;
    if (normalizedStatus === "PAID" && providedAmountPaid < totalAmount) {
      finalStatus = providedAmountPaid === 0 ? "UNPAID" : "PARTIALLY_PAID";
    }
    if (normalizedStatus === "UNPAID" && providedAmountPaid > 0) {
      finalStatus = providedAmountPaid >= totalAmount ? "PAID" : "PARTIALLY_PAID";
    }
    if (normalizedStatus === "PARTIALLY_PAID" && (providedAmountPaid === 0 || providedAmountPaid >= totalAmount)) {
      finalStatus = providedAmountPaid === 0 ? "UNPAID" : "PAID";
    }

    return {
      paymentStatus: finalStatus,
      amountPaid: providedAmountPaid,
      outstandingAmount: Math.max(0, totalAmount - providedAmountPaid),
    };
  }

  async createItem(input: CreateItemInput): Promise<ItemWithComputedFields> {
    const now = new Date().toISOString();

    const item: InventoryItem = {
      itemId: randomUUID(),
      name: input.name.trim(),
      category: input.category?.trim() || "general",
      unit: input.unit?.trim() || "unit",
      lowStockThreshold: input.lowStockThreshold ?? 0,
      isPerishable: Boolean(input.isPerishable),
      taxProfile: {
        ...defaultTaxProfile,
        ...input.taxProfile,
      },
      purchases: [],
      sales: [],
      vendorReturns: [],
      vendorSkuMappings: [],
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
    this.ensureVendorCollections(item);

    if (item.isPerishable && !input.expiresAt) {
      throw new Error("PERISHABLE_EXPIRY_REQUIRED");
    }

    const deliveredAt = input.deliveredAt || input.purchasedAt || new Date().toISOString();
    const tax = this.taxService.calculate(input.purchasePrice, input.quantity, item.taxProfile);
    const purchaseTotal = input.quantity * input.purchasePrice;
    const payment = this.normalizePayment(purchaseTotal, input.paymentStatus, input.amountPaid);

    item.purchases.push({
      purchaseId: randomUUID(),
      quantity: input.quantity,
      purchasePrice: input.purchasePrice,
      market: input.market || "unknown",
      purchasedAt: deliveredAt,
      deliveredAt,
      orderCreatedAt: input.orderCreatedAt,
      promisedDeliveryAt: input.promisedDeliveryAt,
      vendorId: input.vendorId?.trim(),
      vendorName: input.vendorName?.trim(),
      paymentStatus: payment.paymentStatus,
      amountPaid: payment.amountPaid,
      outstandingAmount: payment.outstandingAmount,
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
    this.ensureVendorCollections(item);

    const stock = summarizeStock(item);
    if (input.quantity > stock.currentStock) {
      throw new Error("INSUFFICIENT_STOCK");
    }

    const tax = this.taxService.calculate(input.salePrice, input.quantity, item.taxProfile);
    const saleTotal = input.quantity * input.salePrice;

    const paymentMethod: PaymentMethod = PAYMENT_METHODS.includes(input.paymentMethod as PaymentMethod)
      ? (input.paymentMethod as PaymentMethod)
      : "CASH";

    const paymentStatus: PaymentStatus = PAYMENT_STATUSES.includes(input.paymentStatus as PaymentStatus)
      ? (input.paymentStatus as PaymentStatus)
      : "PAID";

    if (paymentStatus !== "PAID" && !input.customerId?.trim()) {
      throw new Error("CUSTOMER_ID_REQUIRED_FOR_CREDIT_SALE");
    }

    const payment = this.normalizePayment(saleTotal, paymentStatus, input.amountPaid);
    const outstandingAmount = payment.outstandingAmount;
    const customerId = input.customerId?.trim();
    const customerName = input.customerName?.trim();

    if (outstandingAmount > 0 && !this.customerRepository) {
      throw new Error("CUSTOMER_LEDGER_UNAVAILABLE");
    }

    item.sales.push({
      saleId: randomUUID(),
      quantity: input.quantity,
      salePrice: input.salePrice,
      market: input.market || "unknown",
      soldAt: input.soldAt || new Date().toISOString(),
      paymentMethod,
      paymentStatus: payment.paymentStatus,
      amountPaid: payment.amountPaid,
      outstandingAmount,
      customerId,
      customerName,
      tax,
    });
    item.updatedAt = new Date().toISOString();

    await this.repository.update(item);

    if (outstandingAmount > 0 && customerId && this.customerRepository) {
      const existing = await this.customerRepository.findById(customerId);
      const now = new Date().toISOString();
      const customer: Customer = existing
        ? {
            ...existing,
            name: customerName || existing.name,
            currentBalance: existing.currentBalance + outstandingAmount,
            updatedAt: now,
          }
        : {
            customerId,
            name: customerName || customerId,
            currentBalance: outstandingAmount,
            payments: [],
            createdAt: now,
            updatedAt: now,
          };

      if (existing) {
        await this.customerRepository.update(customer);
      } else {
        await this.customerRepository.create(customer);
      }
    }

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
      const normalizedItem: InventoryItem = {
        ...item,
        vendorReturns: item.vendorReturns || [],
        vendorSkuMappings: item.vendorSkuMappings || [],
      };
      const existing = await this.repository.findById(item.itemId);
      if (existing) {
        await this.repository.update(normalizedItem);
      } else {
        await this.repository.create(normalizedItem);
      }
    }
  }

  async addVendorReturn(itemId: string, input: ReturnToVendorInput): Promise<ItemWithComputedFields> {
    const item = await this.repository.findById(itemId);
    if (!item) {
      throw new Error("ITEM_NOT_FOUND");
    }
    this.ensureVendorCollections(item);

    const stock = summarizeStock(item);
    if (input.quantity > stock.currentStock) {
      throw new Error("INSUFFICIENT_STOCK");
    }

    const vendorId = input.vendorId.trim();
    if (!vendorId) {
      throw new Error("VENDOR_ID_REQUIRED");
    }

    const candidatePurchases = [...item.purchases]
      .filter((purchase) => purchase.vendorId === vendorId)
      .sort((a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime());

    if (candidatePurchases.length === 0) {
      throw new Error("VENDOR_PURCHASE_NOT_FOUND");
    }

    const latestPurchasePrice = candidatePurchases[candidatePurchases.length - 1].purchasePrice;
    const returnTax = this.taxService.calculate(latestPurchasePrice, input.quantity, item.taxProfile);
    const creditAmount = input.quantity * latestPurchasePrice + returnTax.totalTax;

    let remainingCredit = creditAmount;
    for (const purchase of candidatePurchases) {
      if (remainingCredit <= 0) {
        break;
      }
      const outstanding = purchase.outstandingAmount ?? 0;
      if (outstanding <= 0) {
        continue;
      }

      const applied = Math.min(outstanding, remainingCredit);
      purchase.outstandingAmount = outstanding - applied;
      if ((purchase.outstandingAmount ?? 0) === 0) {
        purchase.paymentStatus = "PAID";
      } else if ((purchase.amountPaid ?? 0) > 0) {
        purchase.paymentStatus = "PARTIALLY_PAID";
      } else {
        purchase.paymentStatus = "UNPAID";
      }

      remainingCredit -= applied;
    }

    item.vendorReturns.push({
      returnId: randomUUID(),
      purchaseId: candidatePurchases[0].purchaseId,
      vendorId,
      vendorName: input.vendorName?.trim() || candidatePurchases[0].vendorName,
      quantity: input.quantity,
      reason: input.reason || "OTHER",
      note: input.note,
      returnedAt: input.returnedAt || new Date().toISOString(),
      debitNoteNumber: input.debitNoteNumber || `DN-${Date.now()}`,
      creditAmount,
      taxReversal: {
        gstAmount: returnTax.gstAmount,
        vatAmount: returnTax.vatAmount,
        cessAmount: returnTax.cessAmount,
        totalTax: returnTax.totalTax,
      },
    });

    item.updatedAt = new Date().toISOString();
    await this.repository.update(item);

    return withComputedFields(item);
  }

  async upsertVendorSkuMapping(
    itemId: string,
    input: UpsertVendorSkuMappingInput
  ): Promise<ItemWithComputedFields> {
    const item = await this.repository.findById(itemId);
    if (!item) {
      throw new Error("ITEM_NOT_FOUND");
    }
    this.ensureVendorCollections(item);

    const vendorId = input.vendorId.trim();
    const vendorSku = input.vendorSku.trim();
    if (!vendorId || !vendorSku) {
      throw new Error("VENDOR_MAPPING_FIELDS_REQUIRED");
    }

    const existingIndex = item.vendorSkuMappings.findIndex(
      (row) => row.vendorId === vendorId && row.vendorSku === vendorSku
    );
    const updatedAt = new Date().toISOString();

    if (existingIndex >= 0) {
      item.vendorSkuMappings[existingIndex] = {
        ...item.vendorSkuMappings[existingIndex],
        vendorItemName: input.vendorItemName?.trim() || item.vendorSkuMappings[existingIndex].vendorItemName,
        updatedAt,
      };
    } else {
      item.vendorSkuMappings.push({
        vendorId,
        vendorSku,
        vendorItemName: input.vendorItemName?.trim(),
        updatedAt,
      });
    }

    item.updatedAt = updatedAt;
    await this.repository.update(item);
    return withComputedFields(item);
  }
}
