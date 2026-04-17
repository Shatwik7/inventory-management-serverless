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
});
