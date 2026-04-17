import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { route } from "./router";
import { response } from "./shared/http";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    return await route(event);
  } catch (error) {
    return response(500, {
      error: "internal server error",
      details: error instanceof Error ? error.message : "unknown error",
    });
  }
}
