import { FinanceService } from "../application/services/finance-service";
import { CustomerDynamoDbRepository } from "../infrastructure/dynamodb/customer-dynamodb-repository";
import { InventoryDynamoDbRepository } from "../infrastructure/dynamodb/inventory-dynamodb-repository";
import { FinanceController } from "../interfaces/http/controllers/finance-controller";

export function buildFinanceModule(
  inventoryTableName: string,
  customerTableName: string
): FinanceController {
  const inventoryRepository = new InventoryDynamoDbRepository(inventoryTableName);
  const customerRepository = new CustomerDynamoDbRepository(customerTableName);
  const service = new FinanceService(inventoryRepository, customerRepository);
  return new FinanceController(service);
}
