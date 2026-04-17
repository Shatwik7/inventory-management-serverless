import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

export type HttpHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

export const jsonHeaders = {
  "Content-Type": "application/json",
};

export function response(statusCode: number, data: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(data),
  };
}

export function badRequest(message: string): APIGatewayProxyResultV2 {
  return response(400, { error: message });
}

export function unauthorized(message = "unauthorized"): APIGatewayProxyResultV2 {
  return response(401, { error: message });
}

export function forbidden(message = "forbidden"): APIGatewayProxyResultV2 {
  return response(403, { error: message });
}

export function notFound(message: string): APIGatewayProxyResultV2 {
  return response(404, { error: message });
}

export function parseBody<T>(event: APIGatewayProxyEventV2): T {
  if (!event.body) {
    return {} as T;
  }

  try {
    return JSON.parse(event.body) as T;
  } catch (_error) {
    throw new Error("Invalid JSON body");
  }
}

export function toPositiveNumber(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
  return parsed;
}

export function toNonNegativeNumber(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return parsed;
}

export function toIsoDate(value: unknown, fieldName: string): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date`);
  }
  return date.toISOString();
}
