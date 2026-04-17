import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { OwnerCredentials } from "../../domain/entities/auth";
import type { ConfigRepository } from "../../domain/ports/config-repository";
import { docClient } from "./client";

const OWNER_CONFIG_KEY = "OWNER_AUTH";

type OwnerConfigRecord = {
  configKey: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
};

export class ConfigDynamoDbRepository implements ConfigRepository {
  constructor(private readonly tableName: string) {}

  async getOwnerCredentials(): Promise<OwnerCredentials | null> {
    const output = await docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { configKey: OWNER_CONFIG_KEY },
      })
    );

    const record = output.Item as OwnerConfigRecord | undefined;
    if (!record) {
      return null;
    }

    return {
      username: record.username,
      passwordHash: record.passwordHash,
      salt: record.salt,
      createdAt: record.createdAt,
    };
  }

  async setOwnerCredentials(owner: OwnerCredentials): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          configKey: OWNER_CONFIG_KEY,
          ...owner,
        },
      })
    );
  }
}
