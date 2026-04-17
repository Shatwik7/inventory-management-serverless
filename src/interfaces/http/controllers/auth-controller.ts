import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthService } from "../../../application/services/auth-service";
import { badRequest, forbidden, parseBody, response, unauthorized } from "../../../shared/http";

type RegisterOwnerBody = {
  username?: string;
  password?: string;
};

type LoginBody = {
  username?: string;
  password?: string;
};

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  async registerOwner(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const body = parseBody<RegisterOwnerBody>(event);
      if (!body.username || !body.password) {
        return badRequest("username and password are required");
      }

      const owner = await this.authService.registerOwner(body.username.trim(), body.password);
      return response(201, {
        message: "owner registered successfully",
        owner,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "OWNER_ALREADY_REGISTERED") {
        return forbidden("Owner is already registered. This is a single-shop system.");
      }
      return badRequest(error instanceof Error ? error.message : "register failed");
    }
  }

  async login(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    try {
      const body = parseBody<LoginBody>(event);
      if (!body.username || !body.password) {
        return badRequest("username and password are required");
      }

      const token = await this.authService.login(body.username.trim(), body.password);
      return response(200, token);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_CREDENTIALS") {
        return unauthorized("invalid credentials");
      }
      if (error instanceof Error && error.message === "OWNER_NOT_REGISTERED") {
        return unauthorized("owner is not registered yet");
      }
      return badRequest(error instanceof Error ? error.message : "login failed");
    }
  }
}
