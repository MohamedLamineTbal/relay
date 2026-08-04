import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  BearerAuthGuard,
  type AuthenticatedRequest,
} from '../auth/bearer-auth.guard';
import { StripeConnectService } from './stripe-connect.service';

@Controller('stripe-connect')
@UseGuards(BearerAuthGuard)
export class StripeConnectController {
  constructor(private readonly stripeConnectService: StripeConnectService) {}

  @Get('status')
  getStatus(@Req() request: AuthenticatedRequest) {
    return this.stripeConnectService.getStatus(request.auth.workspace.id);
  }

  @Post('onboarding')
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
}
