export type OwnerCredentials = {
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
};

export type AuthTokenPayload = {
  sub: string;
  role: "OWNER";
};
