import type { InventoryItem } from "../entities/inventory";

export type InventoryImportResult = {
  itemsImported: number;
  purchasesImported: number;
  salesImported: number;
};

export type ExcelService = {
  exportInventory(items: InventoryItem[]): string;
  importInventory(base64Content: string): {
    items: InventoryItem[];
    result: InventoryImportResult;
  };
};
