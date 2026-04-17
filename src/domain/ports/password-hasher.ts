export type PasswordHasher = {
  hash(password: string, salt: string): string;
  createSalt(): string;
};
