import type { InventoryItem } from "../entities/inventory";

export type InventoryRepository = {
  create(item: InventoryItem): Promise<void>;
  update(item: InventoryItem): Promise<void>;
  findById(itemId: string): Promise<InventoryItem | null>;
  findAll(): Promise<InventoryItem[]>;
};
