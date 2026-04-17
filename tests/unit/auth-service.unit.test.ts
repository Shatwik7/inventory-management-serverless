import { AuthService } from "../../src/application/services/auth-service";
import { InMemoryConfigRepository } from "../helpers/in-memory-repositories";

describe("AuthService (unit)", () => {
  const passwordHasher = {
    createSalt: jest.fn(() => "salt-1"),
    hash: jest.fn((password: string, salt: string) => `${salt}:${password}`),
  };

  const tokenService = {
    sign: jest.fn(() => "jwt-token"),
    verify: jest.fn(() => ({ sub: "owner", role: "OWNER" as const })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("registers first owner", async () => {
    const repository = new InMemoryConfigRepository();
    const service = new AuthService(repository, passwordHasher, tokenService);

    const result = await service.registerOwner("owner", "password");

    expect(result).toEqual({ username: "owner" });
    expect(passwordHasher.createSalt).toHaveBeenCalledTimes(1);
    expect(passwordHasher.hash).toHaveBeenCalledWith("password", "salt-1");
  });

  it("blocks second owner registration", async () => {
    const repository = new InMemoryConfigRepository();
    const service = new AuthService(repository, passwordHasher, tokenService);

    await service.registerOwner("owner", "password");

    await expect(service.registerOwner("owner2", "password2")).rejects.toThrow(
      "OWNER_ALREADY_REGISTERED"
    );
  });

  it("logs in and issues token", async () => {
    const repository = new InMemoryConfigRepository();
    const service = new AuthService(repository, passwordHasher, tokenService);

    await service.registerOwner("owner", "password");
    const result = await service.login("owner", "password");

    expect(result).toEqual({ token: "jwt-token" });
    expect(tokenService.sign).toHaveBeenCalledWith({ sub: "owner", role: "OWNER" });
  });

  it("rejects invalid credentials", async () => {
    const repository = new InMemoryConfigRepository();
    const service = new AuthService(repository, passwordHasher, tokenService);

    await service.registerOwner("owner", "password");

    await expect(service.login("owner", "wrong-password")).rejects.toThrow("INVALID_CREDENTIALS");
  });
});
