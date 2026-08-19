import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthenticatedWorkspace } from './authenticated-workspace';

export type AuthenticatedRequest = Request & {
  auth: AuthenticatedWorkspace;
};

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bearerToken = request.headers.authorization?.match(/^Bearer (.+)$/);

    if (!bearerToken) {
      throw new UnauthorizedException();
    }

    request.auth = await this.authService.authenticate(bearerToken[1]);
    return true;
  }
}
