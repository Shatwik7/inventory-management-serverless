import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { FinanceService } from "../../../application/services/finance-service";
import { badRequest, notFound, parseBody, response, toNonNegativeNumber } from "../../../shared/http";

type PaymentBody = {
  amount?: number;
  paidAt?: string;
  note?: string;
};

export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  async receivables(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const date = event.queryStringParameters?.date || new Date().toISOString().slice(0, 10);
      const result = await this.financeService.getReceivables(date);
      return response(200, result);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_DATE") {
        return badRequest("date must be a valid date (e.g. 2026-04-18)");
      }
      return badRequest(error instanceof Error ? error.message : "failed to fetch receivables");
    }
  }

  async recordPayment(
    customerId: string,
    event: APIGatewayProxyEventV2
  ): Promise<APIGatewayProxyResultV2> {
    try {
      const body = parseBody<PaymentBody>(event);
      const amount = toNonNegativeNumber(body.amount, "amount");
      if (amount === 0) {
        return badRequest("amount must be greater than 0");
      }

      const result = await this.financeService.recordCustomerPayment({
        customerId,
        amount,
        paidAt: body.paidAt,
        note: body.note,
      });

      return response(200, result);
    } catch (error) {
      if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") {
        return notFound("customer not found");
      }
      if (error instanceof Error && error.message === "INVALID_PAYMENT_AMOUNT") {
        return badRequest("amount must be greater than 0");
      }
      return badRequest(error instanceof Error ? error.message : "failed to record payment");
    }
  }

  async payables(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const date = event.queryStringParameters?.date || new Date().toISOString().slice(0, 10);
      const result = await this.financeService.getPayables(date);
      return response(200, result);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_DATE") {
        return badRequest("date must be a valid date (e.g. 2026-04-18)");
      }
      return badRequest(error instanceof Error ? error.message : "failed to fetch payables");
    }
  }
}
