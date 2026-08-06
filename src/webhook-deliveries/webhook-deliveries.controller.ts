import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  BearerAuthGuard,
  type AuthenticatedRequest,
} from '../auth/bearer-auth.guard';
import { WebhookDeliveriesService } from './webhook-deliveries.service';
import { WebhookReplaysService } from './webhook-replays.service';

@Controller('webhook-destination')
@UseGuards(BearerAuthGuard)
export class WebhookDeliveriesController {
  constructor(private readonly service: WebhookDeliveriesService) {}

  @Put()
  configure(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    if (
      typeof body !== 'object' ||
      body === null ||
      !('url' in body) ||
      typeof body.url !== 'string'
    ) {
      throw new BadRequestException(
        'HTTPS webhook destination URL is required',
      );
    }
    let url: URL;
    try {
      url = new URL(body.url);
    } catch {
      throw new BadRequestException(
        'HTTPS webhook destination URL is required',
      );
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new BadRequestException(
        'HTTPS webhook destination URL is required',
      );
    }
    return this.service.configure(request.auth.workspace.id, url.toString());
  }

  @Get()
  inspect(@Req() request: AuthenticatedRequest) {
    return this.service.inspect(request.auth.workspace.id);
  }

  @Delete()
  @HttpCode(204)
  async remove(@Req() request: AuthenticatedRequest) {
    await this.service.removeDestination(request.auth.workspace.id);
  }
}

@Controller('webhook-deliveries')
@UseGuards(BearerAuthGuard)
export class WebhookDeliveryHistoryController {
  constructor(
    private readonly service: WebhookDeliveriesService,
    private readonly replays: WebhookReplaysService,
  ) {}
  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query('paymentPublicId') paymentPublicId?: string,
    @Query('outcome') outcome?: string,
  ) {
    if (
      outcome &&
      outcome !== 'PENDING' &&
      outcome !== 'DELIVERED' &&
      outcome !== 'FAILED'
    )
      throw new BadRequestException(
        'Outcome must be PENDING, DELIVERED, or FAILED',
      );
    return this.service.list(
      request.auth.workspace.id,
      paymentPublicId,
      outcome as 'PENDING' | 'DELIVERED' | 'FAILED' | undefined,
    );
  }

  @Post(':attemptId/replay')
  @HttpCode(202)
  replay(
    @Param('attemptId') attemptId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.replays.replay(
      request.auth.workspace.id,
      request.auth.user,
      attemptId,
    );
  }
}
