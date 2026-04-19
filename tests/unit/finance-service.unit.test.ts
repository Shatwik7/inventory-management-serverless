import { FinanceService } from "../../src/application/services/finance-service";
import type { InventoryItem } from "../../src/domain/entities/inventory";
import { InMemoryCustomerRepository, InMemoryInventoryRepository } from "../helpers/in-memory-repositories";

function makeInventoryItem(sales: InventoryItem["sales"]): InventoryItem {
  return {
    itemId: "item-1",
    name: "Rice",
    category: "grocery",
    unit: "kg",
    isPerishable: false,
    taxProfile: { gstRate: 0, vatRate: 0, cessRate: 0 },
    purchases: [],
    sales,
    vendorReturns: [],
    vendorSkuMappings: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const taxZero = {
  taxableAmount: 0,
  gstAmount: 0,
  vatAmount: 0,
  cessAmount: 0,
  totalTax: 0,
  totalAmount: 0,
};

describe("FinanceService", () => {
  it("builds receivables with aging buckets", async () => {
    const inventoryRepository = new InMemoryInventoryRepository();
    const customerRepository = new InMemoryCustomerRepository();

    await customerRepository.create({
      customerId: "c1",
      name: "Ravi",
      currentBalance: 350,
      payments: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await inventoryRepository.create(
      makeInventoryItem([
        {
          saleId: "s1",
          quantity: 1,
          salePrice: 100,
          market: "shop",
          soldAt: "2026-04-10T00:00:00.000Z",
          paymentMethod: "CREDIT",
          paymentStatus: "UNPAID",
          amountPaid: 0,
          outstandingAmount: 100,
          customerId: "c1",
          customerName: "Ravi",
          tax: taxZero,
        },
        {
          saleId: "s2",
          quantity: 1,
          salePrice: 200,
          market: "shop",
          soldAt: "2026-03-01T00:00:00.000Z",
          paymentMethod: "CREDIT",
          paymentStatus: "PARTIALLY_PAID",
          amountPaid: 50,
          outstandingAmount: 150,
          customerId: "c1",
          customerName: "Ravi",
          tax: taxZero,
        },
        {
          saleId: "s3",
          quantity: 1,
          salePrice: 300,
          market: "shop",
          soldAt: "2026-01-01T00:00:00.000Z",
          paymentMethod: "CREDIT",
          paymentStatus: "UNPAID",
          amountPaid: 0,
          outstandingAmount: 100,
          customerId: "c1",
          customerName: "Ravi",
          tax: taxZero,
        },
      ])
    );

    const service = new FinanceService(inventoryRepository, customerRepository);
    const result = await service.getReceivables("2026-04-18");

    expect(result.debtors).toHaveLength(1);
    expect(result.debtors[0].customerId).toBe("c1");
    expect(result.debtors[0].currentBalance).toBe(350);
    expect(result.debtors[0].aging.bucket0To30).toBe(100);
    expect(result.debtors[0].aging.bucket31To60).toBe(150);
    expect(result.debtors[0].aging.bucket61Plus).toBe(100);
    expect(result.totals.totalOutstanding).toBe(350);
  });

  it("applies payment to oldest outstanding invoices first", async () => {
    const inventoryRepository = new InMemoryInventoryRepository();
    const customerRepository = new InMemoryCustomerRepository();

    await customerRepository.create({
      customerId: "c2",
      name: "Asha",
      currentBalance: 300,
      payments: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await inventoryRepository.create(
      makeInventoryItem([
        {
          saleId: "older",
          quantity: 1,
          salePrice: 150,
          market: "shop",
          soldAt: "2026-02-01T00:00:00.000Z",
          paymentMethod: "CREDIT",
          paymentStatus: "UNPAID",
          amountPaid: 0,
          outstandingAmount: 150,
          customerId: "c2",
          customerName: "Asha",
          tax: taxZero,
        },
        {
          saleId: "newer",
          quantity: 1,
          salePrice: 150,
          market: "shop",
          soldAt: "2026-03-01T00:00:00.000Z",
          paymentMethod: "CREDIT",
          paymentStatus: "UNPAID",
          amountPaid: 0,
          outstandingAmount: 150,
          customerId: "c2",
          customerName: "Asha",
          tax: taxZero,
        },
      ])
    );

    const service = new FinanceService(inventoryRepository, customerRepository);
    const payment = await service.recordCustomerPayment({
      customerId: "c2",
      amount: 200,
      paidAt: "2026-04-18T09:00:00.000Z",
      note: "part payment",
    });

    expect(payment.appliedAmount).toBe(200);
    expect(payment.unappliedAmount).toBe(0);
    expect(payment.customer.currentBalance).toBe(100);

    const items = await inventoryRepository.findAll();
    const updatedSales = items[0].sales;
    const older = updatedSales.find((s) => s.saleId === "older");
    const newer = updatedSales.find((s) => s.saleId === "newer");

    expect(older?.outstandingAmount).toBe(0);
    expect(older?.paymentStatus).toBe("PAID");
    expect(newer?.outstandingAmount).toBe(100);
    expect(newer?.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("builds payables from outstanding vendor purchase balances", async () => {
    const inventoryRepository = new InMemoryInventoryRepository();
    const customerRepository = new InMemoryCustomerRepository();

    await inventoryRepository.create({
      ...makeInventoryItem([]),
      itemId: "item-payables",
      purchases: [
        {
          purchaseId: "p1",
          quantity: 10,
          purchasePrice: 100,
          market: "m",
          purchasedAt: "2026-04-10T00:00:00.000Z",
          vendorId: "v1",
          vendorName: "Vendor One",
          paymentStatus: "PARTIALLY_PAID",
          amountPaid: 300,
          outstandingAmount: 700,
          tax: taxZero,
        },
        {
          purchaseId: "p2",
          quantity: 5,
          purchasePrice: 100,
          market: "m",
          purchasedAt: "2026-04-12T00:00:00.000Z",
          vendorId: "v1",
          vendorName: "Vendor One",
          paymentStatus: "UNPAID",
          amountPaid: 0,
          outstandingAmount: 500,
          tax: taxZero,
        },
      ],
    });

    const service = new FinanceService(inventoryRepository, customerRepository);
    const result = await service.getPayables("2026-04-18");

    expect(result.creditors).toHaveLength(1);
    expect(result.creditors[0].vendorId).toBe("v1");
    expect(result.creditors[0].currentPayable).toBe(1200);
    expect(result.creditors[0].outstandingBills).toBe(2);
    expect(result.totals.totalPayable).toBe(1200);
    expect(result.totals.totalBills).toBe(2);
  });
});
