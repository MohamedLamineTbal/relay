import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  BearerAuthGuard,
  type AuthenticatedRequest,
} from '../auth/bearer-auth.guard';
import { AlertsService } from './alerts.service';

@Controller('alerts')
@UseGuards(BearerAuthGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('status') status?: string) {
    if (status && status !== 'ACTIVE' && status !== 'ACKNOWLEDGED') {
      throw new BadRequestException('Status must be ACTIVE or ACKNOWLEDGED');
    }
    return this.alerts.list(
      request.auth.workspace.id,
      status as 'ACTIVE' | 'ACKNOWLEDGED' | undefined,
    );
  }

  @Post(':alertId/acknowledge')
  @HttpCode(200)
  acknowledge(
    @Param('alertId') alertId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.alerts.acknowledge(
      request.auth.workspace.id,
      request.auth.user,
      alertId,
    );
  }
}
