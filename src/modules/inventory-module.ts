import { InventoryService } from "../application/services/inventory-service";
import { TaxService } from "../application/services/tax-service";
import { InventoryDynamoDbRepository } from "../infrastructure/dynamodb/inventory-dynamodb-repository";
import { XlsxExcelService } from "../infrastructure/excel/xlsx-excel-service";
import { InventoryController } from "../interfaces/http/controllers/inventory-controller";

export function buildInventoryModule(tableName: string): InventoryController {
  const repository = new InventoryDynamoDbRepository(tableName);
  const taxService = new TaxService();
  const service = new InventoryService(repository, taxService);
  const excelService = new XlsxExcelService();

  return new InventoryController(service, excelService);
}
