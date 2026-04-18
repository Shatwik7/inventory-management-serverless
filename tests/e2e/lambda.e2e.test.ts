import type { APIGatewayProxyResultV2 } from "aws-lambda";
import { buildEvent } from "../helpers/api-gateway-event";

type InventoryRecord = Record<string, any>;

function normalizeResponse(result: APIGatewayProxyResultV2): {
	statusCode: number;
	body: string;
} {
	if (typeof result === "string") {
		return {
			statusCode: 200,
			body: result,
		};
	}

	return {
		statusCode: result.statusCode || 200,
		body: result.body || "{}",
	};
}

jest.mock("../../src/infrastructure/dynamodb/client", () => ({
	docClient: {
		send: jest.fn(),
	},
}));

describe("Lambda API (e2e)", () => {
	const inventoryTable = "shop-test-inventory";
	const customerTable = "shop-test-customers";
	const configTable = "shop-test-config";

	const inventoryStore = new Map<string, InventoryRecord>();
	const customerStore = new Map<string, InventoryRecord>();
	const configStore = new Map<string, InventoryRecord>();

	let sendMock: jest.Mock;

	beforeEach(() => {
		jest.resetModules();
		inventoryStore.clear();
		customerStore.clear();
		configStore.clear();

		process.env.INVENTORY_TABLE = inventoryTable;
		process.env.CUSTOMER_TABLE = customerTable;
		process.env.CONFIG_TABLE = configTable;
		process.env.AUTH_JWT_SECRET = "test-secret";

		const mockedClient = require("../../src/infrastructure/dynamodb/client") as {
			docClient: { send: jest.Mock };
		};
		sendMock = mockedClient.docClient.send as unknown as jest.Mock;

		sendMock.mockImplementation(async (command: unknown) => {
			const commandName = (command as { constructor?: { name?: string } })?.constructor?.name;

			if (commandName === "PutCommand") {
				const input = command.input as Record<string, any>;
				const table = input.TableName as string;
				const item = input.Item as InventoryRecord;

				if (table === inventoryTable) {
					inventoryStore.set(item.itemId, structuredClone(item));
					return {};
				}

				if (table === configTable) {
					configStore.set(item.configKey, structuredClone(item));
					return {};
				}

				if (table === customerTable) {
					customerStore.set(item.customerId, structuredClone(item));
					return {};
				}
			}

			if (commandName === "GetCommand") {
				const input = command.input as Record<string, any>;
				const table = input.TableName as string;
				const key = input.Key as Record<string, string>;

				if (table === inventoryTable) {
					return {
						Item: inventoryStore.get(key.itemId),
					};
				}

				if (table === configTable) {
					return {
						Item: configStore.get(key.configKey),
					};
				}

				if (table === customerTable) {
					return {
						Item: customerStore.get(key.customerId),
					};
				}
			}

			if (commandName === "ScanCommand") {
				const input = command.input as Record<string, any>;
				const table = input.TableName as string;

				if (table === inventoryTable) {
					return {
						Items: [...inventoryStore.values()].map((v) => structuredClone(v)),
					};
				}

				if (table === customerTable) {
					return {
						Items: [...customerStore.values()].map((v) => structuredClone(v)),
					};
				}
			}

			return {};
		});
	});

	it("rejects private endpoint without token", async () => {
		const { handler } = require("../../src/lambda") as {
			handler: (event: any) => Promise<APIGatewayProxyResultV2>;
		};

		const raw = await handler(
			buildEvent({
				method: "GET",
				path: "/items",
			})
		);
		const res = normalizeResponse(raw);

		expect(res.statusCode).toBe(401);
		expect(JSON.parse(res.body || "{}")).toEqual({ error: "Missing bearer token" });
	});

	it("supports owner registration, login, and protected inventory create", async () => {
		const { handler } = require("../../src/lambda") as {
			handler: (event: any) => Promise<APIGatewayProxyResultV2>;
		};

		const registerRaw = await handler(
			buildEvent({
				method: "POST",
				path: "/auth/register-owner",
				body: { username: "owner", password: "pass123" },
			})
		);
		const registerRes = normalizeResponse(registerRaw);
		expect(registerRes.statusCode).toBe(201);

		const loginRaw = await handler(
			buildEvent({
				method: "POST",
				path: "/auth/login",
				body: { username: "owner", password: "pass123" },
			})
		);
		const loginRes = normalizeResponse(loginRaw);
		expect(loginRes.statusCode).toBe(200);

		const token = JSON.parse(loginRes.body || "{}").token as string;
		expect(typeof token).toBe("string");
		expect(token.length).toBeGreaterThan(10);

		const createRaw = await handler(
			buildEvent({
				method: "POST",
				path: "/items",
				headers: {
					authorization: `Bearer ${token}`,
				},
				body: {
					name: "Sugar",
					unit: "kg",
					taxProfile: {
						gstRate: 5,
					},
				},
			})
		);
		const createRes = normalizeResponse(createRaw);
		expect(createRes.statusCode).toBe(201);

		const listRaw = await handler(
			buildEvent({
				method: "GET",
				path: "/items",
				headers: {
					authorization: `Bearer ${token}`,
				},
			})
		);
		const listRes = normalizeResponse(listRaw);

		const parsed = JSON.parse(listRes.body || "{}");
		expect(listRes.statusCode).toBe(200);
		expect(parsed.items).toHaveLength(1);
		expect(parsed.items[0].name).toBe("Sugar");
	});
});
