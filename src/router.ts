import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { appModule } from "./modules/app-module";
import { notFound, response, unauthorized } from "./shared/http";

function getBearerToken(event: APIGatewayProxyEventV2): string | null {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function isPublicRoute(method: string | undefined, path: string): boolean {
  return (
    (method === "GET" && path === "/") ||
    (method === "POST" && path === "/auth/register-owner") ||
    (method === "POST" && path === "/auth/login")
  );
}

async function authorize(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2 | null> {
  const method = event.requestContext.http.method;
  const path = event.rawPath || "/";

  if (isPublicRoute(method, path)) {
    return null;
  }

  const token = getBearerToken(event);
  if (!token) {
    return unauthorized("Missing bearer token");
  }

  try {
    appModule.authService.verifyToken(token);
    return null;
  } catch (_error) {
    return unauthorized("Invalid or expired token");
  }
}

export async function route(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath || "/";

  const authError = await authorize(event);
  if (authError) {
    return authError;
  }

  if (method === "GET" && path === "/") {
    return response(200, {
      service: "shop-inventory-api",
      status: "ok",
      architecture: "hexagonal",
      endpoints: [
        "POST /auth/register-owner",
        "POST /auth/login",
        "POST /items",
        "GET /items",
        "GET /items/{itemId}",
        "POST /items/{itemId}/purchases",
        "POST /items/{itemId}/sales",
        "GET /inventory/expiring?days=7",
        "GET /analytics/demand?windowDays=30",
        "GET /analytics/tax-summary?from=ISO_DATE&to=ISO_DATE",
        "GET /analytics/margin?method=FIFO|WAC",
        "GET /analytics/reconciliation?date=2026-04-18",
        "GET /inventory/export",
        "POST /inventory/import",
      ],
    });
  }

  if (method === "POST" && path === "/auth/register-owner") {
    return appModule.authController.registerOwner(event);
  }

  if (method === "POST" && path === "/auth/login") {
    return appModule.authController.login(event);
  }

  if (method === "POST" && path === "/items") {
    return appModule.inventoryController.createItem(event);
  }

  if (method === "GET" && path === "/items") {
    return appModule.inventoryController.listItems();
  }

  const itemById = path.match(/^\/items\/([^/]+)$/);
  if (method === "GET" && itemById) {
    return appModule.inventoryController.getItem(itemById[1]);
  }

  const itemPurchase = path.match(/^\/items\/([^/]+)\/purchases$/);
  if (method === "POST" && itemPurchase) {
    return appModule.inventoryController.addPurchase(itemPurchase[1], event);
  }

  const itemSale = path.match(/^\/items\/([^/]+)\/sales$/);
  if (method === "POST" && itemSale) {
    return appModule.inventoryController.addSale(itemSale[1], event);
  }

  if (method === "GET" && path === "/inventory/expiring") {
    return appModule.inventoryController.expiring(event);
  }

  if (method === "GET" && path === "/analytics/demand") {
    return appModule.analyticsController.demand(event);
  }

  if (method === "GET" && path === "/analytics/tax-summary") {
    return appModule.analyticsController.taxSummary(event);
  }

  if (method === "GET" && path === "/analytics/margin") {
    return appModule.analyticsController.marginAnalysis(event);
  }

  if (method === "GET" && path === "/analytics/reconciliation") {
    return appModule.analyticsController.reconciliation(event);
  }

  if (method === "GET" && path === "/inventory/export") {
    return appModule.inventoryController.exportExcel();
  }

  if (method === "POST" && path === "/inventory/import") {
    return appModule.inventoryController.importExcel(event);
  }

  return notFound("route not found");
}
