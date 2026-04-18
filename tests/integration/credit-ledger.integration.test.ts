import { InventoryService } from "../../src/application/services/inventory-service";
import { TaxService } from "../../src/application/services/tax-service";
import { InMemoryCustomerRepository, InMemoryInventoryRepository } from "../helpers/in-memory-repositories";

describe("Credit ledger flow (integration)", () => {
  let inventoryRepository: InMemoryInventoryRepository;
  let customerRepository: InMemoryCustomerRepository;
  let service: InventoryService;

  beforeEach(() => {
    inventoryRepository = new InMemoryInventoryRepository();
    customerRepository = new InMemoryCustomerRepository();
    service = new InventoryService(inventoryRepository, new TaxService(), customerRepository);
  });

  it("records unpaid sale as receivable and creates customer debt", async () => {
    const item = await service.createItem({ name: "Notebook", unit: "pcs" });

    await service.addPurchase(item.itemId, {
      quantity: 20,
      purchasePrice: 40,
    });

    const afterSale = await service.addSale(item.itemId, {
      quantity: 5,
      salePrice: 100,
      paymentStatus: "UNPAID",
      customerId: "cust-1",
      customerName: "Ravi",
      paymentMethod: "CREDIT",
    });

    const sale = afterSale.sales[0];
    expect(sale.paymentStatus).toBe("UNPAID");
    expect(sale.amountPaid).toBe(0);
    expect(sale.outstandingAmount).toBe(500);

    const customer = await customerRepository.findById("cust-1");
    expect(customer?.name).toBe("Ravi");
    expect(customer?.currentBalance).toBe(500);
  });

  it("records partially paid sale and debt delta", async () => {
    const item = await service.createItem({ name: "Pen", unit: "pcs" });

    await service.addPurchase(item.itemId, {
      quantity: 50,
      purchasePrice: 5,
    });

    const afterSale = await service.addSale(item.itemId, {
      quantity: 10,
      salePrice: 20,
      paymentStatus: "PARTIALLY_PAID",
      amountPaid: 80,
      customerId: "cust-2",
      customerName: "Asha",
      paymentMethod: "UPI",
    });

    const sale = afterSale.sales[0];
    expect(sale.paymentStatus).toBe("PARTIALLY_PAID");
    expect(sale.amountPaid).toBe(80);
    expect(sale.outstandingAmount).toBe(120);

    const customer = await customerRepository.findById("cust-2");
    expect(customer?.currentBalance).toBe(120);
  });
});
