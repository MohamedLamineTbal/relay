import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhooksService } from './webhooks.service';

@Controller('stripe/webhooks')
@ApiTags('Stripe Webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @HttpCode(200)
  @ApiHeader({
    name: 'Stripe-Signature',
    required: true,
    description: 'Stripe webhook signature for the unmodified request body',
  })
  process(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ) {
    if (!signature || !request.rawBody) {
      throw new BadRequestException('Valid Stripe signature is required');
    }

    return this.webhooksService.process(request.rawBody, signature);
  }
}
