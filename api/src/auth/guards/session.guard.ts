import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "../auth.service";

export interface AuthenticatedUser {
  id: string;
  email: string;
  image: string | null;
  name: string;
  onboardingCompleted: boolean;
}

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

export function sessionRequiredError() {
  return new UnauthorizedException({
    code: "SESSION_REQUIRED",
    message: "A valid session is required.",
  });
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const session = await this.authService.getCurrentSession(
      request,
      response,
    );

    if (!session) {
      throw sessionRequiredError();
    }

    request.user = {
      ...session.user,
      onboardingCompleted: session.onboardingCompleted,
    };

    return true;
  }
}
