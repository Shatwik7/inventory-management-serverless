import type { AuthTokenPayload } from "../entities/auth";

export type TokenService = {
  sign(payload: AuthTokenPayload): string;
  verify(token: string): AuthTokenPayload;
};
