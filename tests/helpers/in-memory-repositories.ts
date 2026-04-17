import type { OwnerCredentials } from "../../src/domain/entities/auth";
import type { InventoryItem } from "../../src/domain/entities/inventory";
import type { ConfigRepository } from "../../src/domain/ports/config-repository";
import type { InventoryRepository } from "../../src/domain/ports/inventory-repository";

export class InMemoryInventoryRepository implements InventoryRepository {
  private readonly store = new Map<string, InventoryItem>();

  async create(item: InventoryItem): Promise<void> {
    this.store.set(item.itemId, structuredClone(item));
  }

  async update(item: InventoryItem): Promise<void> {
    this.store.set(item.itemId, structuredClone(item));
  }

  async findById(itemId: string): Promise<InventoryItem | null> {
    const item = this.store.get(itemId);
    return item ? structuredClone(item) : null;
  }

  async findAll(): Promise<InventoryItem[]> {
    return [...this.store.values()].map((item) => structuredClone(item));
  }
}

export class InMemoryConfigRepository implements ConfigRepository {
  private owner: OwnerCredentials | null = null;

  async getOwnerCredentials(): Promise<OwnerCredentials | null> {
    return this.owner ? structuredClone(this.owner) : null;
  }

  async setOwnerCredentials(owner: OwnerCredentials): Promise<void> {
    this.owner = structuredClone(owner);
  }
}
