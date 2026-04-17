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
  expiresAt?: string;
};

type AddSaleBody = {
  quantity?: number;
  salePrice?: number;
  market?: string;
  soldAt?: string;
};

type ImportBody = {
  fileBase64?: string;
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
      });

      return response(200, updated);
    } catch (error) {
      if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
        return notFound("item not found");
      }
      if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
        return badRequest("not enough stock for this sale");
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
}
