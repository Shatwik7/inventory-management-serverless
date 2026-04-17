import jwt from "jsonwebtoken";
import type { AuthTokenPayload } from "../../domain/entities/auth";
import type { TokenService } from "../../domain/ports/token-service";

export class JwtTokenService implements TokenService {
  constructor(private readonly secret: string) {}

  sign(payload: AuthTokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: "8h" });
  }

  verify(token: string): AuthTokenPayload {
    return jwt.verify(token, this.secret) as AuthTokenPayload;
  }
}
