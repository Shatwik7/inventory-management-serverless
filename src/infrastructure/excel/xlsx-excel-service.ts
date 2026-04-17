import XLSX from "xlsx";
import type { InventoryItem } from "../../domain/entities/inventory";
import type { ExcelService, InventoryImportResult } from "../../domain/ports/excel-service";

type ItemRow = {
  itemId: string;
  name: string;
  category: string;
  unit: string;
  isPerishable: boolean;
  gstRate: number;
  vatRate: number;
  cessRate: number;
  hsnCode?: string;
  createdAt: string;
  updatedAt: string;
};

export class XlsxExcelService implements ExcelService {
  exportInventory(items: InventoryItem[]): string {
    const workbook = XLSX.utils.book_new();

    const itemRows: ItemRow[] = items.map((item) => ({
      itemId: item.itemId,
      name: item.name,
      category: item.category,
      unit: item.unit,
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

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(itemRows), "Items");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(purchaseRows), "Purchases");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(saleRows), "Sales");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return Buffer.from(buffer).toString("base64");
  }

  importInventory(base64Content: string): { items: InventoryItem[]; result: InventoryImportResult } {
    const contentBuffer = Buffer.from(base64Content, "base64");
    const workbook = XLSX.read(contentBuffer, { type: "buffer" });

    const itemsSheet = workbook.Sheets.Items;
    const purchasesSheet = workbook.Sheets.Purchases;
    const salesSheet = workbook.Sheets.Sales;

    if (!itemsSheet) {
      throw new Error("Items sheet is required");
    }

    const itemRows = XLSX.utils.sheet_to_json<ItemRow>(itemsSheet);
    const purchaseRows = purchasesSheet
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(purchasesSheet)
      : [];
    const saleRows = salesSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(salesSheet) : [];

    const itemsMap = new Map<string, InventoryItem>();

    for (const row of itemRows) {
      itemsMap.set(row.itemId, {
        itemId: String(row.itemId),
        name: String(row.name),
        category: String(row.category || "general"),
        unit: String(row.unit || "unit"),
        isPerishable: Boolean(row.isPerishable),
        taxProfile: {
          gstRate: Number(row.gstRate || 0),
          vatRate: Number(row.vatRate || 0),
          cessRate: Number(row.cessRate || 0),
          hsnCode: row.hsnCode ? String(row.hsnCode) : undefined,
        },
        purchases: [],
        sales: [],
        createdAt: row.createdAt || new Date().toISOString(),
        updatedAt: row.updatedAt || new Date().toISOString(),
      });
    }

    for (const row of purchaseRows) {
      const itemId = String(row.itemId || "");
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
      const itemId = String(row.itemId || "");
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
