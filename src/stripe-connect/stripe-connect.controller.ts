import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  BearerAuthGuard,
  type AuthenticatedRequest,
} from '../auth/bearer-auth.guard';
import { StripeConnectService } from './stripe-connect.service';

@Controller('stripe-connect')
@ApiTags('Stripe Connect')
export class StripeConnectController {
  constructor(
    private readonly stripeConnectService: StripeConnectService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  @UseGuards(BearerAuthGuard)
  @ApiBearerAuth('bearer')
  getStatus(@Req() request: AuthenticatedRequest) {
    return this.stripeConnectService.getStatus(request.auth.workspace.id);
  }

  @Post('onboarding')
  @UseGuards(BearerAuthGuard)
  @ApiBearerAuth('bearer')
  startOnboarding(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const hasRequestBody =
      body !== undefined &&
      (typeof body !== 'object' ||
        body === null ||
        Array.isArray(body) ||
        Object.keys(body).length > 0);

    if (hasRequestBody) {
      throw new BadRequestException(
        'Stripe onboarding does not accept a request body',
      );
    }

    return this.stripeConnectService.startOnboarding(request.auth.workspace.id);
  }

  @Post('dashboard')
  @UseGuards(BearerAuthGuard)
  @ApiBearerAuth('bearer')
  createDashboardLink(@Req() request: AuthenticatedRequest) {
    return this.stripeConnectService.createDashboardLink(
      request.auth.workspace.id,
    );
  }

  @Post('replacement')
  @UseGuards(BearerAuthGuard)
  @ApiBearerAuth('bearer')
  startReplacement(@Req() request: AuthenticatedRequest) {
    return this.stripeConnectService.startReplacement(
      request.auth.workspace.id,
    );
  }

  @Post('replacement/activate')
  @UseGuards(BearerAuthGuard)
  @ApiBearerAuth('bearer')
  activateReplacement(@Req() request: AuthenticatedRequest) {
    return this.stripeConnectService.activateReplacement(
      request.auth.workspace.id,
    );
  }

  @Post('replacement/cancel')
  @UseGuards(BearerAuthGuard)
  @ApiBearerAuth('bearer')
  cancelReplacement(@Req() request: AuthenticatedRequest) {
    return this.stripeConnectService.cancelReplacement(
      request.auth.workspace.id,
    );
  }

  @Get('onboarding/refresh')
  @Redirect(undefined, 302)
  refreshOnboarding(@Query('flow') flow?: string) {
    const url = new URL(
      '/stripe',
      this.config.getOrThrow<string>('FRONTEND_APP_URL'),
    );
    url.searchParams.set(
      flow === 'replacement' ? 'replacement' : 'onboarding',
      'refresh',
    );

    return { url: url.toString() };
  }

  @Get('onboarding/return')
  @Redirect(undefined, 302)
  returnFromOnboarding(@Query('flow') flow?: string) {
    const url = new URL(
      '/stripe',
      this.config.getOrThrow<string>('FRONTEND_APP_URL'),
    );
    url.searchParams.set(
      flow === 'replacement' ? 'replacement' : 'onboarding',
      'return',
    );

    return { url: url.toString() };
  }
}
