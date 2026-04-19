import XLSX from "xlsx";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "../../domain/entities/inventory";
import type { InventoryItem, PaymentMethod, PaymentStatus } from "../../domain/entities/inventory";
import type { ExcelService, InventoryImportResult } from "../../domain/ports/excel-service";

type ItemRow = {
  itemId: string;
  name: string;
  category: string;
  unit: string;
  lowStockThreshold?: number;
  isPerishable: boolean;
  gstRate: number;
  vatRate: number;
  cessRate: number;
  hsnCode?: string;
  createdAt: string;
  updatedAt: string;
};

type VendorSkuMappingRow = {
  itemId?: string;
  vendorId: string;
  vendorSku: string;
  vendorItemName?: string;
  updatedAt?: string;
};

export class XlsxExcelService implements ExcelService {
  exportInventory(items: InventoryItem[]): string {
    const workbook = XLSX.utils.book_new();

    const itemRows: ItemRow[] = items.map((item) => ({
      itemId: item.itemId,
      name: item.name,
      category: item.category,
      unit: item.unit,
      lowStockThreshold: item.lowStockThreshold ?? 0,
      isPerishable: item.isPerishable,
      gstRate: item.taxProfile.gstRate,
      vatRate: item.taxProfile.vatRate,
      cessRate: item.taxProfile.cessRate,
      hsnCode: item.taxProfile.hsnCode,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const purchaseRows = items.flatMap((item) =>
      item.purchases.map((purchase) => ({
        itemId: item.itemId,
        ...purchase,
      }))
    );

    const saleRows = items.flatMap((item) =>
      item.sales.map((sale) => ({
        itemId: item.itemId,
        ...sale,
      }))
    );

    const vendorSkuRows: VendorSkuMappingRow[] = items.flatMap((item) =>
      item.vendorSkuMappings.map((mapping) => ({
        itemId: item.itemId,
        vendorId: mapping.vendorId,
        vendorSku: mapping.vendorSku,
        vendorItemName: mapping.vendorItemName,
        updatedAt: mapping.updatedAt,
      }))
    );

    const vendorReturnRows = items.flatMap((item) =>
      item.vendorReturns.map((vendorReturn) => ({
        itemId: item.itemId,
        ...vendorReturn,
      }))
    );

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(itemRows), "Items");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(purchaseRows), "Purchases");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(saleRows), "Sales");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(vendorSkuRows), "VendorSkuMappings");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(vendorReturnRows), "VendorReturns");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return Buffer.from(buffer).toString("base64");
  }

  importInventory(base64Content: string): { items: InventoryItem[]; result: InventoryImportResult } {
    const contentBuffer = Buffer.from(base64Content, "base64");
    const workbook = XLSX.read(contentBuffer, { type: "buffer" });

    const itemsSheet = workbook.Sheets.Items;
    const purchasesSheet = workbook.Sheets.Purchases;
    const salesSheet = workbook.Sheets.Sales;
    const vendorSkuMappingsSheet = workbook.Sheets.VendorSkuMappings;
    const vendorReturnsSheet = workbook.Sheets.VendorReturns;

    if (!itemsSheet) {
      throw new Error("Items sheet is required");
    }

    const itemRows = XLSX.utils.sheet_to_json<ItemRow>(itemsSheet);
    const purchaseRows = purchasesSheet
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(purchasesSheet)
      : [];
    const saleRows = salesSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(salesSheet) : [];
    const vendorSkuRows = vendorSkuMappingsSheet
      ? XLSX.utils.sheet_to_json<VendorSkuMappingRow>(vendorSkuMappingsSheet)
      : [];
    const vendorReturnRows = vendorReturnsSheet
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(vendorReturnsSheet)
      : [];

    const itemsMap = new Map<string, InventoryItem>();
    const vendorMap = new Map<string, string>();

    const resolveItemId = (row: Record<string, unknown>): string => {
      const directItemId = String(row.itemId || "").trim();
      if (directItemId) {
        return directItemId;
      }

      const vendorId = String(row.vendorId || "").trim();
      const vendorSku = String(row.vendorSku || row.vendorItemName || "").trim();
      if (!vendorId || !vendorSku) {
        return "";
      }

      return vendorMap.get(`${vendorId}::${vendorSku}`) || "";
    };

    for (const row of itemRows) {
      itemsMap.set(row.itemId, {
        itemId: String(row.itemId),
        name: String(row.name),
        category: String(row.category || "general"),
        unit: String(row.unit || "unit"),
        lowStockThreshold: Number(row.lowStockThreshold || 0),
        isPerishable: Boolean(row.isPerishable),
        taxProfile: {
          gstRate: Number(row.gstRate || 0),
          vatRate: Number(row.vatRate || 0),
          cessRate: Number(row.cessRate || 0),
          hsnCode: row.hsnCode ? String(row.hsnCode) : undefined,
        },
        purchases: [],
        sales: [],
        vendorReturns: [],
        vendorSkuMappings: [],
        createdAt: row.createdAt || new Date().toISOString(),
        updatedAt: row.updatedAt || new Date().toISOString(),
      });
    }

    for (const row of vendorSkuRows) {
      const itemId = String(row.itemId || "").trim();
      const item = itemsMap.get(itemId);
      if (!item) {
        continue;
      }

      const vendorId = String(row.vendorId || "").trim();
      const vendorSku = String(row.vendorSku || "").trim();
      if (!vendorId || !vendorSku) {
        continue;
      }

      const mapping = {
        vendorId,
        vendorSku,
        vendorItemName: row.vendorItemName ? String(row.vendorItemName) : undefined,
        updatedAt: row.updatedAt ? String(row.updatedAt) : new Date().toISOString(),
      };

      item.vendorSkuMappings.push(mapping);
      vendorMap.set(`${vendorId}::${vendorSku}`, item.itemId);
      if (mapping.vendorItemName) {
        vendorMap.set(`${vendorId}::${mapping.vendorItemName}`, item.itemId);
      }
    }

    for (const row of purchaseRows) {
      const itemId = resolveItemId(row);
      const item = itemsMap.get(itemId);
      if (!item) {
        continue;
      }

      item.purchases.push({
        purchaseId: String(row.purchaseId),
        quantity: Number(row.quantity || 0),
        purchasePrice: Number(row.purchasePrice || 0),
        market: String(row.market || "unknown"),
        purchasedAt: String(row.purchasedAt || new Date().toISOString()),
        deliveredAt: row.deliveredAt ? String(row.deliveredAt) : String(row.purchasedAt || new Date().toISOString()),
        orderCreatedAt: row.orderCreatedAt ? String(row.orderCreatedAt) : undefined,
        promisedDeliveryAt: row.promisedDeliveryAt ? String(row.promisedDeliveryAt) : undefined,
        vendorId: row.vendorId ? String(row.vendorId) : undefined,
        vendorName: row.vendorName ? String(row.vendorName) : undefined,
        paymentStatus: row.paymentStatus ? (String(row.paymentStatus) as PaymentStatus) : undefined,
        amountPaid: row.amountPaid !== undefined ? Number(row.amountPaid) : undefined,
        outstandingAmount: row.outstandingAmount !== undefined ? Number(row.outstandingAmount) : undefined,
        expiresAt: row.expiresAt ? String(row.expiresAt) : undefined,
        tax: {
          taxableAmount: Number(row.taxableAmount || 0),
          gstAmount: Number(row.gstAmount || 0),
          vatAmount: Number(row.vatAmount || 0),
          cessAmount: Number(row.cessAmount || 0),
          totalTax: Number(row.totalTax || 0),
          totalAmount: Number(row.totalAmount || 0),
        },
      });
    }

    for (const row of saleRows) {
      const itemId = resolveItemId(row);
      const item = itemsMap.get(itemId);
      if (!item) {
        continue;
      }

      item.sales.push({
        saleId: String(row.saleId),
        quantity: Number(row.quantity || 0),
        salePrice: Number(row.salePrice || 0),
        market: String(row.market || "unknown"),
        soldAt: String(row.soldAt || new Date().toISOString()),
        paymentMethod: PAYMENT_METHODS.includes(String(row.paymentMethod) as PaymentMethod)
          ? (String(row.paymentMethod) as PaymentMethod)
          : "CASH",
        paymentStatus: PAYMENT_STATUSES.includes(String(row.paymentStatus) as PaymentStatus)
          ? (String(row.paymentStatus) as PaymentStatus)
          : "PAID",
        amountPaid:
          row.amountPaid !== undefined
            ? Number(row.amountPaid)
            : Number(row.quantity || 0) * Number(row.salePrice || 0),
        outstandingAmount: Number(row.outstandingAmount || 0),
        customerId: row.customerId ? String(row.customerId) : undefined,
        customerName: row.customerName ? String(row.customerName) : undefined,
        tax: {
          taxableAmount: Number(row.taxableAmount || 0),
          gstAmount: Number(row.gstAmount || 0),
          vatAmount: Number(row.vatAmount || 0),
          cessAmount: Number(row.cessAmount || 0),
          totalTax: Number(row.totalTax || 0),
          totalAmount: Number(row.totalAmount || 0),
        },
      });
    }

    for (const row of vendorReturnRows) {
      const itemId = resolveItemId(row);
      const item = itemsMap.get(itemId);
      if (!item) {
        continue;
      }

      item.vendorReturns.push({
        returnId: String(row.returnId || ""),
        purchaseId: row.purchaseId ? String(row.purchaseId) : undefined,
        vendorId: String(row.vendorId || ""),
        vendorName: row.vendorName ? String(row.vendorName) : undefined,
        quantity: Number(row.quantity || 0),
        reason: (String(row.reason || "OTHER") as "FAULTY" | "EXPIRED" | "DAMAGED" | "OTHER"),
        note: row.note ? String(row.note) : undefined,
        returnedAt: String(row.returnedAt || new Date().toISOString()),
        debitNoteNumber: String(row.debitNoteNumber || `DN-${Date.now()}`),
        creditAmount: Number(row.creditAmount || 0),
        taxReversal: {
          gstAmount: Number(row.gstAmount || row.taxReversalGstAmount || 0),
          vatAmount: Number(row.vatAmount || row.taxReversalVatAmount || 0),
          cessAmount: Number(row.cessAmount || row.taxReversalCessAmount || 0),
          totalTax: Number(row.totalTax || row.taxReversalTotalTax || 0),
        },
      });
    }

    return {
      items: [...itemsMap.values()],
      result: {
        itemsImported: itemRows.length,
        purchasesImported: purchaseRows.length,
        salesImported: saleRows.length,
      },
    };
  }
}
