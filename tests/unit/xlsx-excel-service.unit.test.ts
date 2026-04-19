import XLSX from "xlsx";
import { XlsxExcelService } from "../../src/infrastructure/excel/xlsx-excel-service";

describe("XlsxExcelService vendor SKU mapping import", () => {
  it("maps purchase rows by vendorId + vendorSku when itemId is missing", () => {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          itemId: "sku-123",
          name: "Soap",
          category: "hygiene",
          unit: "pcs",
          lowStockThreshold: 0,
          isPerishable: false,
          gstRate: 5,
          vatRate: 0,
          cessRate: 0,
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
      ]),
      "Items"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          itemId: "sku-123",
          vendorId: "vendor-a",
          vendorSku: "Item-A",
          vendorItemName: "Item-A",
        },
      ]),
      "VendorSkuMappings"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          vendorId: "vendor-a",
          vendorSku: "Item-A",
          purchaseId: "p-1",
          quantity: 20,
          purchasePrice: 15,
          market: "wholesale",
          purchasedAt: "2026-04-02T00:00:00.000Z",
          taxableAmount: 300,
          gstAmount: 15,
          vatAmount: 0,
          cessAmount: 0,
          totalTax: 15,
          totalAmount: 315,
        },
      ]),
      "Purchases"
    );

    const base64 = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })).toString("base64");

    const service = new XlsxExcelService();
    const imported = service.importInventory(base64);

    expect(imported.items).toHaveLength(1);
    expect(imported.items[0].itemId).toBe("sku-123");
    expect(imported.items[0].vendorSkuMappings).toHaveLength(1);
    expect(imported.items[0].purchases).toHaveLength(1);
    expect(imported.items[0].purchases[0].purchaseId).toBe("p-1");
  });
});
