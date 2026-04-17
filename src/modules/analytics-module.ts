import { AnalyticsService } from "../application/services/analytics-service";
import { InventoryDynamoDbRepository } from "../infrastructure/dynamodb/inventory-dynamodb-repository";
import { AnalyticsController } from "../interfaces/http/controllers/analytics-controller";

export function buildAnalyticsModule(tableName: string): AnalyticsController {
  const repository = new InventoryDynamoDbRepository(tableName);
  const service = new AnalyticsService(repository);
  return new AnalyticsController(service);
}
