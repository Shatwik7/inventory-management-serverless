import { randomBytes, scryptSync } from "crypto";
import type { PasswordHasher } from "../../domain/ports/password-hasher";

export class CryptoPasswordHasher implements PasswordHasher {
  createSalt(): string {
    return randomBytes(16).toString("hex");
  }

  hash(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString("hex");
  }
}
