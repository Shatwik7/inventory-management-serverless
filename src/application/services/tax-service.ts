import type { TaxBreakdown, TaxProfile } from "../../domain/entities/inventory";

export class TaxService {
  calculate(unitPrice: number, quantity: number, profile: TaxProfile): TaxBreakdown {
    const taxableAmount = unitPrice * quantity;
    const gstAmount = (taxableAmount * profile.gstRate) / 100;
    const vatAmount = (taxableAmount * profile.vatRate) / 100;
    const cessAmount = (taxableAmount * profile.cessRate) / 100;
    const totalTax = gstAmount + vatAmount + cessAmount;

    return {
      taxableAmount,
      gstAmount,
      vatAmount,
      cessAmount,
      totalTax,
      totalAmount: taxableAmount + totalTax,
    };
  }
}
