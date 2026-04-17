import type { OwnerCredentials } from "../entities/auth";

export type ConfigRepository = {
  getOwnerCredentials(): Promise<OwnerCredentials | null>;
  setOwnerCredentials(owner: OwnerCredentials): Promise<void>;
};
