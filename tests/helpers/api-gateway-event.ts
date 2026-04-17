import type { APIGatewayProxyEventV2 } from "aws-lambda";

type BuildEventInput = {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
};

export function buildEvent(input: BuildEventInput): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: input.path,
    rawQueryString: "",
    cookies: [],
    headers: input.headers || {},
    queryStringParameters: input.query,
    requestContext: {
      accountId: "123456789012",
      apiId: "api-id",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: input.method,
        path: input.path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "jest",
      },
      requestId: "req-id",
      routeKey: "$default",
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    pathParameters: undefined,
    isBase64Encoded: false,
    stageVariables: undefined,
  };
}
