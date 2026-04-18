import { randomUUID } from "crypto";
import type { Customer } from "../../domain/entities/customer";
import type { CustomerRepository } from "../../domain/ports/customer-repository";
import type { InventoryRepository } from "../../domain/ports/inventory-repository";

type Aging = {
  bucket0To30: number;
  bucket31To60: number;
  bucket61Plus: number;
};

type Debtor = {
  customerId: string;
  customerName: string;
  currentBalance: number;
  outstandingInvoices: number;
  oldestDueDate: string | null;
  aging: Aging;
};

export class FinanceService {
  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly customerRepository: CustomerRepository
  ) {}

  async getReceivables(date: string): Promise<{
    date: string;
    debtors: Debtor[];
    totals: Aging & { totalOutstanding: number; totalDebtors: number };
  }> {
    const asOf = new Date(date);
    if (Number.isNaN(asOf.getTime())) {
      throw new Error("INVALID_DATE");
    }

    const items = await this.inventoryRepository.findAll();
    const customers = await this.customerRepository.findAll();
    const customerMap = new Map(customers.map((customer) => [customer.customerId, customer]));

    const byCustomer = new Map<string, Debtor>();

    for (const item of items) {
      for (const sale of item.sales) {
        const outstanding = sale.outstandingAmount ?? 0;
        if (outstanding <= 0 || !sale.customerId) {
          continue;
        }

        const soldAt = new Date(sale.soldAt);
        if (soldAt > asOf) {
          continue;
        }

        const ageDays = Math.floor((asOf.getTime() - soldAt.getTime()) / (24 * 3600 * 1000));
        const customerId = sale.customerId;
        const knownCustomer = customerMap.get(customerId);
        const customerName = sale.customerName || knownCustomer?.name || customerId;

        if (!byCustomer.has(customerId)) {
          byCustomer.set(customerId, {
            customerId,
            customerName,
            currentBalance: 0,
            outstandingInvoices: 0,
            oldestDueDate: null,
            aging: {
              bucket0To30: 0,
              bucket31To60: 0,
              bucket61Plus: 0,
            },
          });
        }

        const entry = byCustomer.get(customerId)!;
        entry.currentBalance += outstanding;
        entry.outstandingInvoices += 1;

        if (!entry.oldestDueDate || soldAt.toISOString() < entry.oldestDueDate) {
          entry.oldestDueDate = soldAt.toISOString();
        }

        if (ageDays <= 30) {
          entry.aging.bucket0To30 += outstanding;
        } else if (ageDays <= 60) {
          entry.aging.bucket31To60 += outstanding;
        } else {
          entry.aging.bucket61Plus += outstanding;
        }
      }
    }

    const debtors = [...byCustomer.values()].sort((a, b) => b.currentBalance - a.currentBalance);
    const totals = debtors.reduce(
      (acc, debtor) => {
        acc.bucket0To30 += debtor.aging.bucket0To30;
        acc.bucket31To60 += debtor.aging.bucket31To60;
        acc.bucket61Plus += debtor.aging.bucket61Plus;
        acc.totalOutstanding += debtor.currentBalance;
        return acc;
      },
      {
        bucket0To30: 0,
        bucket31To60: 0,
        bucket61Plus: 0,
        totalOutstanding: 0,
        totalDebtors: debtors.length,
      }
    );

    return {
      date: asOf.toISOString().slice(0, 10),
      debtors,
      totals,
    };
  }

  async recordCustomerPayment(input: {
    customerId: string;
    amount: number;
    paidAt?: string;
    note?: string;
  }): Promise<{
    customer: Customer;
    appliedAmount: number;
    unappliedAmount: number;
  }> {
    const customer = await this.customerRepository.findById(input.customerId);
    if (!customer) {
      throw new Error("CUSTOMER_NOT_FOUND");
    }

    if (input.amount <= 0) {
      throw new Error("INVALID_PAYMENT_AMOUNT");
    }

    const items = await this.inventoryRepository.findAll();
    const salesWithOutstanding = items
      .flatMap((item) =>
        item.sales
          .filter((sale) => sale.customerId === input.customerId && (sale.outstandingAmount ?? 0) > 0)
          .map((sale) => ({ item, sale }))
      )
      .sort((a, b) => new Date(a.sale.soldAt).getTime() - new Date(b.sale.soldAt).getTime());

    let remaining = input.amount;
    const touchedItemIds = new Set<string>();

    for (const row of salesWithOutstanding) {
      if (remaining <= 0) {
        break;
      }

      const outstanding = row.sale.outstandingAmount ?? 0;
      if (outstanding <= 0) {
        continue;
      }

      const applied = Math.min(remaining, outstanding);
      row.sale.amountPaid = (row.sale.amountPaid ?? 0) + applied;
      row.sale.outstandingAmount = outstanding - applied;
      row.sale.paymentStatus = row.sale.outstandingAmount === 0 ? "PAID" : "PARTIALLY_PAID";
      touchedItemIds.add(row.item.itemId);
      remaining -= applied;
    }

    for (const item of items) {
      if (!touchedItemIds.has(item.itemId)) {
        continue;
      }
      item.updatedAt = new Date().toISOString();
      await this.inventoryRepository.update(item);
    }

    const appliedAmount = input.amount - remaining;
    const updatedCustomer: Customer = {
      ...customer,
      currentBalance: Math.max(0, customer.currentBalance - appliedAmount),
      payments: [
        ...customer.payments,
        {
          paymentId: randomUUID(),
          amount: appliedAmount,
          paidAt: input.paidAt || new Date().toISOString(),
          note: input.note,
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    await this.customerRepository.update(updatedCustomer);

    return {
      customer: updatedCustomer,
      appliedAmount,
      unappliedAmount: remaining,
    };
  }
}
