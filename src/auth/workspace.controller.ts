import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  BearerAuthGuard,
  type AuthenticatedRequest,
} from './bearer-auth.guard';

@Controller('workspace')
@UseGuards(BearerAuthGuard)
export class WorkspaceController {
  @Get()
  getWorkspace(@Req() request: AuthenticatedRequest) {
    return {
      ...request.auth.workspace,
      role: request.auth.role,
      owner: request.auth.user,
    };
  }
}
