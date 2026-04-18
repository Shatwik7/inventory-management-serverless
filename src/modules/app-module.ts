import { buildAnalyticsModule } from "./analytics-module";
import { buildAuthModule } from "./auth-module";
import { buildFinanceModule } from "./finance-module";
import { buildInventoryModule } from "./inventory-module";

const inventoryTable = process.env.INVENTORY_TABLE;
const customerTable = process.env.CUSTOMER_TABLE;
const configTable = process.env.CONFIG_TABLE;
const jwtSecret = process.env.AUTH_JWT_SECRET;

if (!inventoryTable) {
  throw new Error("INVENTORY_TABLE env is missing");
}
if (!configTable) {
  throw new Error("CONFIG_TABLE env is missing");
}
if (!customerTable) {
  throw new Error("CUSTOMER_TABLE env is missing");
}
if (!jwtSecret) {
  throw new Error("AUTH_JWT_SECRET env is missing");
}

const inventoryController = buildInventoryModule(inventoryTable, customerTable);
const analyticsController = buildAnalyticsModule(inventoryTable);
const financeController = buildFinanceModule(inventoryTable, customerTable);
const { authController, authService } = buildAuthModule(configTable, jwtSecret);

export const appModule = {
  inventoryController,
  analyticsController,
  financeController,
  authController,
  authService,
};
