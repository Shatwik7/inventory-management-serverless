import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { InventoryService } from "../../../application/services/inventory-service";
import type { ExcelService } from "../../../domain/ports/excel-service";
import {
  badRequest,
  notFound,
  parseBody,
  response,
  toIsoDate,
  toNonNegativeNumber,
  toPositiveNumber,
} from "../../../shared/http";

type CreateItemBody = {
  name?: string;
  category?: string;
  unit?: string;
  lowStockThreshold?: number;
  isPerishable?: boolean;
  taxProfile?: {
    gstRate?: number;
    vatRate?: number;
    cessRate?: number;
    hsnCode?: string;
  };
};

type AddPurchaseBody = {
  quantity?: number;
  purchasePrice?: number;
  market?: string;
  purchasedAt?: string;
  deliveredAt?: string;
  orderCreatedAt?: string;
  promisedDeliveryAt?: string;
  vendorId?: string;
  vendorName?: string;
  paymentStatus?: string;
  amountPaid?: number;
  expiresAt?: string;
};

type AddSaleBody = {
  quantity?: number;
  salePrice?: number;
  market?: string;
  soldAt?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  amountPaid?: number;
  customerId?: string;
  customerName?: string;
};

type ImportBody = {
  fileBase64?: string;
};

type VendorReturnBody = {
  quantity?: number;
  vendorId?: string;
  vendorName?: string;
  returnedAt?: string;
  reason?: "FAULTY" | "EXPIRED" | "DAMAGED" | "OTHER";
  note?: string;
  debitNoteNumber?: string;
};

type VendorSkuMappingBody = {
  vendorId?: string;
  vendorSku?: string;
  vendorItemName?: string;
};

export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly excelService: ExcelService
  ) {}

  async createItem(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const body = parseBody<CreateItemBody>(event);
      if (!body.name || typeof body.name !== "string") {
        return badRequest("name is required");
      }

      const item = await this.inventoryService.createItem({
        name: body.name,
        category: body.category,
        unit: body.unit,
        lowStockThreshold:
          body.lowStockThreshold === undefined
            ? undefined
            : toNonNegativeNumber(body.lowStockThreshold, "lowStockThreshold"),
        isPerishable: body.isPerishable,
        taxProfile: {
          gstRate: body.taxProfile?.gstRate
            ? toNonNegativeNumber(body.taxProfile.gstRate, "taxProfile.gstRate")
            : 0,
          vatRate: body.taxProfile?.vatRate
            ? toNonNegativeNumber(body.taxProfile.vatRate, "taxProfile.vatRate")
            : 0,
          cessRate: body.taxProfile?.cessRate
            ? toNonNegativeNumber(body.taxProfile.cessRate, "taxProfile.cessRate")
            : 0,
          hsnCode: body.taxProfile?.hsnCode,
        },
      });

      return response(201, item);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "failed to create item");
    }
  }

  async listItems(): Promise<APIGatewayProxyResultV2> {
    const items = await this.inventoryService.listItems();
    return response(200, { items });
  }

  async getItem(itemId: string): Promise<APIGatewayProxyResultV2> {
    const item = await this.inventoryService.getItem(itemId);
    if (!item) {
      return notFound("item not found");
    }

    return response(200, item);
  }

  async addPurchase(itemId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const body = parseBody<AddPurchaseBody>(event);
      const updated = await this.inventoryService.addPurchase(itemId, {
        quantity: toPositiveNumber(body.quantity, "quantity"),
        purchasePrice: toPositiveNumber(body.purchasePrice, "purchasePrice"),
        market: body.market,
        deliveredAt: body.deliveredAt ? toIsoDate(body.deliveredAt, "deliveredAt") : undefined,
        orderCreatedAt: body.orderCreatedAt
          ? toIsoDate(body.orderCreatedAt, "orderCreatedAt")
          : undefined,
        promisedDeliveryAt: body.promisedDeliveryAt
          ? toIsoDate(body.promisedDeliveryAt, "promisedDeliveryAt")
          : undefined,
        vendorId: body.vendorId,
        vendorName: body.vendorName,
        paymentStatus: body.paymentStatus as import("../../../domain/entities/inventory").PaymentStatus | undefined,
        amountPaid:
          body.amountPaid === undefined
            ? undefined
            : toNonNegativeNumber(body.amountPaid, "amountPaid"),
        purchasedAt: body.purchasedAt ? toIsoDate(body.purchasedAt, "purchasedAt") : undefined,
        expiresAt: body.expiresAt ? toIsoDate(body.expiresAt, "expiresAt") : undefined,
      });

      return response(200, updated);
    } catch (error) {
      if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
        return notFound("item not found");
      }
      if (error instanceof Error && error.message === "PERISHABLE_EXPIRY_REQUIRED") {
        return badRequest("expiresAt is required for perishable items");
      }
      return badRequest(error instanceof Error ? error.message : "failed to add purchase");
    }
  }

  async addSale(itemId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const body = parseBody<AddSaleBody>(event);
      const updated = await this.inventoryService.addSale(itemId, {
        quantity: toPositiveNumber(body.quantity, "quantity"),
        salePrice: toPositiveNumber(body.salePrice, "salePrice"),
        market: body.market,
        soldAt: body.soldAt ? toIsoDate(body.soldAt, "soldAt") : undefined,
        paymentMethod: body.paymentMethod as import("../../../domain/entities/inventory").PaymentMethod | undefined,
        paymentStatus: body.paymentStatus as import("../../../domain/entities/inventory").PaymentStatus | undefined,
        amountPaid:
          body.amountPaid === undefined
            ? undefined
            : toNonNegativeNumber(body.amountPaid, "amountPaid"),
        customerId: body.customerId,
        customerName: body.customerName,
      });

      return response(200, updated);
    } catch (error) {
      if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
        return notFound("item not found");
      }
      if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
        return badRequest("not enough stock for this sale");
      }
      if (error instanceof Error && error.message === "CUSTOMER_ID_REQUIRED_FOR_CREDIT_SALE") {
        return badRequest("customerId is required for unpaid or partially paid sales");
      }
      if (error instanceof Error && error.message === "INVALID_AMOUNT_PAID") {
        return badRequest("amountPaid must be between 0 and total sale amount");
      }
      if (error instanceof Error && error.message === "CUSTOMER_LEDGER_UNAVAILABLE") {
        return badRequest("customer ledger is unavailable");
      }
      return badRequest(error instanceof Error ? error.message : "failed to add sale");
    }
  }

  async expiring(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const days = toPositiveNumber(event.queryStringParameters?.days || 7, "days");
      const expiring = await this.inventoryService.getExpiringItems(days);
      return response(200, { days, expiring });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "failed to fetch expiring items");
    }
  }

  async exportExcel(): Promise<APIGatewayProxyResultV2> {
    const items = await this.inventoryService.listItems();
    const workbookBase64 = this.excelService.exportInventory(items);

    return response(200, {
      fileName: `shop-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      workbookBase64,
    });
  }

  async importExcel(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const body = parseBody<ImportBody>(event);
      if (!body.fileBase64) {
        return badRequest("fileBase64 is required");
      }

      const imported = this.excelService.importInventory(body.fileBase64);
      await this.inventoryService.importItems(imported.items);

      return response(200, {
        message: "inventory imported",
        ...imported.result,
      });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "failed to import inventory");
    }
  }

  async addVendorReturn(itemId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const body = parseBody<VendorReturnBody>(event);
      if (!body.vendorId || typeof body.vendorId !== "string") {
        return badRequest("vendorId is required");
      }

      const updated = await this.inventoryService.addVendorReturn(itemId, {
        quantity: toPositiveNumber(body.quantity, "quantity"),
        vendorId: body.vendorId,
        vendorName: body.vendorName,
        returnedAt: body.returnedAt ? toIsoDate(body.returnedAt, "returnedAt") : undefined,
        reason: body.reason,
        note: body.note,
        debitNoteNumber: body.debitNoteNumber,
      });

      return response(200, updated);
    } catch (error) {
      if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
        return notFound("item not found");
      }
      if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
        return badRequest("not enough stock for this return");
      }
      if (error instanceof Error && error.message === "VENDOR_ID_REQUIRED") {
        return badRequest("vendorId is required");
      }
      if (error instanceof Error && error.message === "VENDOR_PURCHASE_NOT_FOUND") {
        return badRequest("no purchases found for this vendor and item");
      }
      return badRequest(error instanceof Error ? error.message : "failed to return stock to vendor");
    }
  }

  async upsertVendorSkuMapping(
    itemId: string,
    event: APIGatewayProxyEventV2
  ): Promise<APIGatewayProxyResultV2> {
    try {
      const body = parseBody<VendorSkuMappingBody>(event);
      const updated = await this.inventoryService.upsertVendorSkuMapping(itemId, {
        vendorId: String(body.vendorId || ""),
        vendorSku: String(body.vendorSku || ""),
        vendorItemName: body.vendorItemName,
      });

      return response(200, updated);
    } catch (error) {
      if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
        return notFound("item not found");
      }
      if (error instanceof Error && error.message === "VENDOR_MAPPING_FIELDS_REQUIRED") {
        return badRequest("vendorId and vendorSku are required");
      }
      return badRequest(error instanceof Error ? error.message : "failed to upsert vendor sku mapping");
    }
  }
}
