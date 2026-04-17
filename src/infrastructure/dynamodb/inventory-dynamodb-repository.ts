import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { InventoryItem } from "../../domain/entities/inventory";
import type { InventoryRepository } from "../../domain/ports/inventory-repository";
import { docClient } from "./client";

export class InventoryDynamoDbRepository implements InventoryRepository {
  constructor(private readonly tableName: string) {}

  async create(item: InventoryItem): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    );
  }

  async update(item: InventoryItem): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    );
  }

  async findById(itemId: string): Promise<InventoryItem | null> {
    const output = await docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { itemId },
      })
    );

    return (output.Item as InventoryItem | undefined) || null;
  }

  async findAll(): Promise<InventoryItem[]> {
    const output = await docClient.send(
      new ScanCommand({
        TableName: this.tableName,
      })
    );

    return (output.Items as InventoryItem[] | undefined) || [];
  }
}
