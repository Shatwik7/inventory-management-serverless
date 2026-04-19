import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { AnalyticsService } from "../../../application/services/analytics-service";
import type { CogsValuationMethod } from "../../../domain/entities/inventory";
import { badRequest, response, toIsoDate, toPositiveNumber } from "../../../shared/http";

export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  async demand(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const windowDays = toPositiveNumber(event.queryStringParameters?.windowDays || 30, "windowDays");
      const trends = await this.analyticsService.getDemand(windowDays);
      return response(200, trends);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "failed to fetch demand trends");
    }
  }

  async vendorPerformance(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const from = event.queryStringParameters?.from
        ? toIsoDate(event.queryStringParameters.from, "from")
        : monthStart;
      const to = event.queryStringParameters?.to
        ? toIsoDate(event.queryStringParameters.to, "to")
        : now.toISOString();

      const performance = await this.analyticsService.getVendorPerformance(from, to);
      return response(200, performance);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "failed to fetch vendor performance");
    }
  }

  async taxSummary(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const from = event.queryStringParameters?.from
        ? toIsoDate(event.queryStringParameters.from, "from")
        : monthStart;
      const to = event.queryStringParameters?.to
        ? toIsoDate(event.queryStringParameters.to, "to")
        : now.toISOString();

      const summary = await this.analyticsService.getTaxSummary(from, to);
      return response(200, summary);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "failed to fetch tax summary");
    }
  }

  async marginAnalysis(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const methodParam = (event.queryStringParameters?.method ?? "FIFO").toUpperCase();
      if (methodParam !== "FIFO" && methodParam !== "WAC") {
        return badRequest("method must be FIFO or WAC");
      }
      const result = await this.analyticsService.getMarginAnalysis(methodParam as CogsValuationMethod);
      return response(200, result);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "failed to fetch margin analysis");
    }
  }

  async reconciliation(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const dateParam = event.queryStringParameters?.date ?? new Date().toISOString().slice(0, 10);
      const parsed = new Date(dateParam);
      if (Number.isNaN(parsed.getTime())) {
        return badRequest("date must be a valid date (e.g. 2026-04-18)");
      }
      const result = await this.analyticsService.getReconciliation(dateParam);
      return response(200, result);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "failed to fetch reconciliation");
    }
  }

  async cashFlowProjection(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const forecastDays = toPositiveNumber(event.queryStringParameters?.forecastDays || 14, "forecastDays");
      const demandWindowDays = toPositiveNumber(
        event.queryStringParameters?.demandWindowDays || 30,
        "demandWindowDays"
      );
      const result = await this.analyticsService.getCashFlowProjection(forecastDays, demandWindowDays);
      return response(200, result);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "failed to fetch cash flow projection");
    }
  }
}
