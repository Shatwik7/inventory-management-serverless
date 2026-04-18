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
}
