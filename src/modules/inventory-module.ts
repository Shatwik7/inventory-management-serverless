import { InventoryService } from "../application/services/inventory-service";
import { CustomerDynamoDbRepository } from "../infrastructure/dynamodb/customer-dynamodb-repository";
import { TaxService } from "../application/services/tax-service";
import { InventoryDynamoDbRepository } from "../infrastructure/dynamodb/inventory-dynamodb-repository";
import { XlsxExcelService } from "../infrastructure/excel/xlsx-excel-service";
import { InventoryController } from "../interfaces/http/controllers/inventory-controller";

export function buildInventoryModule(
  inventoryTableName: string,
  customerTableName: string
): InventoryController {
  const repository = new InventoryDynamoDbRepository(inventoryTableName);
  const customerRepository = new CustomerDynamoDbRepository(customerTableName);
  const taxService = new TaxService();
  const service = new InventoryService(repository, taxService, customerRepository);
  const excelService = new XlsxExcelService();

  return new InventoryController(service, excelService);
}
