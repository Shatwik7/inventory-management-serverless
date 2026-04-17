import { TaxService } from "../../src/application/services/tax-service";

describe("TaxService (unit)", () => {
  it("calculates GST, VAT and cess breakdown correctly", () => {
    const service = new TaxService();

    const tax = service.calculate(100, 2, {
      gstRate: 18,
      vatRate: 5,
      cessRate: 1,
    });

    expect(tax.taxableAmount).toBe(200);
    expect(tax.gstAmount).toBe(36);
    expect(tax.vatAmount).toBe(10);
    expect(tax.cessAmount).toBe(2);
    expect(tax.totalTax).toBe(48);
    expect(tax.totalAmount).toBe(248);
  });
});
