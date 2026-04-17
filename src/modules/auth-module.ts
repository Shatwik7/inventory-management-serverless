import { AuthService } from "../application/services/auth-service";
import { ConfigDynamoDbRepository } from "../infrastructure/dynamodb/config-dynamodb-repository";
import { CryptoPasswordHasher } from "../infrastructure/security/crypto-password-hasher";
import { JwtTokenService } from "../infrastructure/security/jwt-token-service";
import { AuthController } from "../interfaces/http/controllers/auth-controller";

export function buildAuthModule(configTableName: string, jwtSecret: string): {
  authController: AuthController;
  authService: AuthService;
} {
  const configRepository = new ConfigDynamoDbRepository(configTableName);
  const passwordHasher = new CryptoPasswordHasher();
  const tokenService = new JwtTokenService(jwtSecret);
  const authService = new AuthService(configRepository, passwordHasher, tokenService);

  return {
    authController: new AuthController(authService),
    authService,
  };
}
