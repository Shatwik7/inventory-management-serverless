import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { Customer } from "../../domain/entities/customer";
import type { CustomerRepository } from "../../domain/ports/customer-repository";
import { docClient } from "./client";

export class CustomerDynamoDbRepository implements CustomerRepository {
  constructor(private readonly tableName: string) {}

  async create(customer: Customer): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: customer,
      })
    );
  }

  async update(customer: Customer): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: customer,
      })
    );
  }

  async findById(customerId: string): Promise<Customer | null> {
    const output = await docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { customerId },
      })
    );

    return (output.Item as Customer | undefined) || null;
  }

  async findAll(): Promise<Customer[]> {
    const output = await docClient.send(
      new ScanCommand({
        TableName: this.tableName,
      })
    );

    return (output.Items as Customer[] | undefined) || [];
  }
}
