import { InventoryService } from "../../src/application/services/inventory-service";
import { TaxService } from "../../src/application/services/tax-service";
import { InMemoryInventoryRepository } from "../helpers/in-memory-repositories";

describe("InventoryService (integration)", () => {
  let repository: InMemoryInventoryRepository;
  let service: InventoryService;

  beforeEach(() => {
    repository = new InMemoryInventoryRepository();
    service = new InventoryService(repository, new TaxService());
  });

  it("creates item, records purchase/sale, and computes stock and tax", async () => {
    const item = await service.createItem({
      name: "Tomato",
      category: "vegetable",
      unit: "kg",
      isPerishable: true,
      taxProfile: { gstRate: 5, vatRate: 0, cessRate: 0 },
    });

    const afterPurchase = await service.addPurchase(item.itemId, {
      quantity: 100,
      purchasePrice: 20,
      expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    });

    expect(afterPurchase.currentStock).toBe(100);
    expect(afterPurchase.purchases[0].tax.gstAmount).toBe(100);

    const afterSale = await service.addSale(item.itemId, {
      quantity: 30,
      salePrice: 30,
    });

    expect(afterSale.currentStock).toBe(70);
    expect(afterSale.sales[0].tax.gstAmount).toBe(45);
  });

  it("rejects sale when stock is insufficient", async () => {
    const item = await service.createItem({ name: "Rice", unit: "kg" });

    await expect(
      service.addSale(item.itemId, {
        quantity: 1,
        salePrice: 40,
      })
    ).rejects.toThrow("INSUFFICIENT_STOCK");
  });

  it("returns expiring perishable batches", async () => {
    const item = await service.createItem({ name: "Milk", isPerishable: true, unit: "ltr" });

    await service.addPurchase(item.itemId, {
      quantity: 10,
      purchasePrice: 50,
      expiresAt: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
    });

    const expiring = await service.getExpiringItems(7);

    expect(expiring).toHaveLength(1);
    expect(expiring[0].itemId).toBe(item.itemId);
    expect(expiring[0].expiringBatches).toHaveLength(1);
  });

  it("creates debit note return that reduces stock and payable", async () => {
    const item = await service.createItem({
      name: "Yogurt",
      unit: "box",
      isPerishable: true,
      taxProfile: { gstRate: 5, vatRate: 0, cessRate: 0 },
    });

    const afterPurchase = await service.addPurchase(item.itemId, {
      quantity: 50,
      purchasePrice: 10,
      vendorId: "v-dairy",
      vendorName: "Dairy Vendor",
      paymentStatus: "UNPAID",
      amountPaid: 0,
      orderCreatedAt: "2026-04-01T00:00:00.000Z",
      promisedDeliveryAt: "2026-04-03T00:00:00.000Z",
      deliveredAt: "2026-04-04T00:00:00.000Z",
      expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    });

    expect(afterPurchase.currentStock).toBe(50);
    expect(afterPurchase.purchases[0].outstandingAmount).toBe(500);

    const afterReturn = await service.addVendorReturn(item.itemId, {
      quantity: 10,
      vendorId: "v-dairy",
      reason: "EXPIRED",
      note: "expired batch",
      returnedAt: "2026-04-05T00:00:00.000Z",
      debitNoteNumber: "DN-1001",
    });

    expect(afterReturn.currentStock).toBe(40);
    expect(afterReturn.vendorReturns).toHaveLength(1);
    expect(afterReturn.vendorReturns[0].debitNoteNumber).toBe("DN-1001");
    expect(afterReturn.vendorReturns[0].taxReversal.gstAmount).toBe(5);
    expect(afterReturn.purchases[0].outstandingAmount).toBe(395);
  });

  it("upserts vendor sku mapping for item", async () => {
    const item = await service.createItem({ name: "Detergent", unit: "pack" });

    const updated = await service.upsertVendorSkuMapping(item.itemId, {
      vendorId: "v-clean",
      vendorSku: "Item-A",
      vendorItemName: "Detergent Premium",
    });

    expect(updated.vendorSkuMappings).toHaveLength(1);
    expect(updated.vendorSkuMappings[0].vendorId).toBe("v-clean");
    expect(updated.vendorSkuMappings[0].vendorSku).toBe("Item-A");
  });
});
