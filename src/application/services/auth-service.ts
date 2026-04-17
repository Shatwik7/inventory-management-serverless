import type { OwnerCredentials } from "../../domain/entities/auth";
import type { ConfigRepository } from "../../domain/ports/config-repository";
import type { PasswordHasher } from "../../domain/ports/password-hasher";
import type { TokenService } from "../../domain/ports/token-service";

export class AuthService {
  constructor(
    private readonly configRepository: ConfigRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService
  ) {}

  async registerOwner(username: string, password: string): Promise<{ username: string }> {
    const existingOwner = await this.configRepository.getOwnerCredentials();
    if (existingOwner) {
      throw new Error("OWNER_ALREADY_REGISTERED");
    }

    const salt = this.passwordHasher.createSalt();
    const passwordHash = this.passwordHasher.hash(password, salt);

    const owner: OwnerCredentials = {
      username,
      passwordHash,
      salt,
      createdAt: new Date().toISOString(),
    };

    await this.configRepository.setOwnerCredentials(owner);
    return { username: owner.username };
  }

  async login(username: string, password: string): Promise<{ token: string }> {
    const owner = await this.configRepository.getOwnerCredentials();
    if (!owner) {
      throw new Error("OWNER_NOT_REGISTERED");
    }

    const providedHash = this.passwordHasher.hash(password, owner.salt);
    if (owner.username !== username || providedHash !== owner.passwordHash) {
      throw new Error("INVALID_CREDENTIALS");
    }

    const token = this.tokenService.sign({
      sub: owner.username,
      role: "OWNER",
    });

    return { token };
  }

  verifyToken(token: string): { username: string; role: "OWNER" } {
    const payload = this.tokenService.verify(token);
    return {
      username: payload.sub,
      role: payload.role,
    };
  }
}
