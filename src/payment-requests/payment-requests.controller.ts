import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  BearerAuthGuard,
  type AuthenticatedRequest,
} from '../auth/bearer-auth.guard';
import { PaymentRequestsService } from './payment-requests.service';

const MAX_PAYMENT_AMOUNT = 99_999_999;

@Controller()
export class PaymentRequestsController {
  constructor(
    private readonly paymentRequestsService: PaymentRequestsService,
  ) {}

  @Post('payment-requests')
  @UseGuards(BearerAuthGuard)
  create(
    @Body()
    body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException('Checkout request body is required');
    }

    const checkoutBody = body as Record<string, unknown>;
    const description = checkoutBody.description;
    const amount = checkoutBody.amount;
    const customerId = checkoutBody.customerId;
    const currency = checkoutBody.currency;

    if (!currency) {
      throw new BadRequestException(
        'Currency is required for checkout creation',
      );
    }

    if (!idempotencyKey) {
      throw new BadRequestException(
        'Idempotency-Key header is required for checkout creation',
      );
    }

    if (idempotencyKey.trim().length === 0 || idempotencyKey.length > 200) {
      throw new BadRequestException(
        'Idempotency-Key must be between 1 and 200 characters',
      );
    }

    if (
      typeof amount !== 'number' ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      throw new BadRequestException('Amount must be a positive integer');
    }

    if (amount > MAX_PAYMENT_AMOUNT) {
      throw new BadRequestException(
        `Amount must be between 1 and ${MAX_PAYMENT_AMOUNT} minor units`,
      );
    }

    if (
      typeof customerId !== 'number' ||
      !Number.isInteger(customerId) ||
      customerId <= 0
    ) {
      throw new BadRequestException('Customer ID must be a positive integer');
    }

    if (typeof currency !== 'string' || !/^[a-z]{3}$/.test(currency)) {
      throw new BadRequestException(
        'Currency must be a three-letter lowercase code',
      );
    }

    if (
      typeof description !== 'string' ||
      description.trim().length === 0 ||
      description.length > 500
    ) {
      throw new BadRequestException(
        'Description must be between 1 and 500 characters',
      );
    }

    return this.paymentRequestsService.createCheckout({
      description,
      amount,
      currency,
      customerId,
      workspaceId: request.auth.workspace.id,
      idempotencyKey,
    });
  }

  @Get('payment-requests')
  @UseGuards(BearerAuthGuard)
  findMany(@Req() request: AuthenticatedRequest) {
    return this.paymentRequestsService.findMany(request.auth.workspace.id);
  }

  @Get('payment-requests/:publicId')
  @UseGuards(BearerAuthGuard)
  findOne(
    @Param('publicId') publicId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentRequestsService.findOne(
      publicId,
      request.auth.workspace.id,
    );
  }

  @Get('payment-requests/:publicId/timeline')
  @UseGuards(BearerAuthGuard)
  findTimeline(
    @Param('publicId') publicId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentRequestsService.findTimeline(
      publicId,
      request.auth.workspace.id,
    );
  }

  @Get('pay/:publicId')
  findByPublicId(@Param('publicId') publicId: string) {
    return this.paymentRequestsService.findByPublicId(publicId);
  }
}
