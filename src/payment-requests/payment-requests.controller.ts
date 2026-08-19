import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  BearerAuthGuard,
  type AuthenticatedRequest,
} from '../auth/bearer-auth.guard';
import { CreatePaymentRequestDto } from './payment-request.dto';
import { PaymentRequestsService } from './payment-requests.service';

const MAX_PAYMENT_AMOUNT = 99_999_999;
const PAYMENT_CURRENCY = 'usd';

@Controller()
@ApiTags('Payments')
export class PaymentRequestsController {
  constructor(
    private readonly paymentRequestsService: PaymentRequestsService,
    private readonly config: ConfigService,
  ) {}

  @Get('payments/success')
  @Redirect(undefined, 302)
  returnFromSuccessfulCheckout(
    @Query('session_id') sessionId: string | undefined,
  ) {
    const url = new URL(
      '/payments/success',
      this.config.getOrThrow<string>('FRONTEND_APP_URL'),
    );
    if (sessionId) url.searchParams.set('session_id', sessionId);

    return { url: url.toString() };
  }

  @Get('payments/cancel')
  @Redirect(undefined, 302)
  returnFromCanceledCheckout() {
    const url = new URL(
      '/payments/cancel',
      this.config.getOrThrow<string>('FRONTEND_APP_URL'),
    );

    return { url: url.toString() };
  }

  @Post('payment-requests')
  @UseGuards(BearerAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiBody({ type: CreatePaymentRequestDto })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique key for safely retrying checkout creation',
  })
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
    const internalReference = checkoutBody.internalReference;
    const amount = checkoutBody.amount;
    const customerId = checkoutBody.customerId;
    const requestedCurrency = checkoutBody.currency;
    const sendEmail = checkoutBody.sendEmail ?? false;
    const message = checkoutBody.message;

    if (
      ['html', 'attachments', 'from', 'sender', 'subject'].some(
        (field) => field in checkoutBody,
      )
    ) {
      throw new BadRequestException('Custom email content is not supported');
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

    if (
      requestedCurrency !== undefined &&
      requestedCurrency !== PAYMENT_CURRENCY
    ) {
      throw new BadRequestException('Relay supports USD only');
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

    if (
      internalReference !== undefined &&
      (typeof internalReference !== 'string' || internalReference.length > 120)
    ) {
      throw new BadRequestException(
        'Internal reference must be a string no longer than 120 characters',
      );
    }

    if (typeof sendEmail !== 'boolean') {
      throw new BadRequestException('sendEmail must be a boolean');
    }

    if (
      message !== undefined &&
      (typeof message !== 'string' || message.length > 500)
    ) {
      throw new BadRequestException(
        'Message must be a string no longer than 500 characters',
      );
    }

    if (!sendEmail && message !== undefined) {
      throw new BadRequestException(
        'Message can only be supplied when sendEmail is true',
      );
    }

    if (typeof message === 'string' && /(?:https?:\/\/|www\.)/i.test(message)) {
      throw new BadRequestException('Message cannot contain links');
    }

    return this.paymentRequestsService.createCheckout({
      description,
      internalReference:
        typeof internalReference === 'string'
          ? internalReference.trim() || null
          : null,
      amount,
      currency: PAYMENT_CURRENCY,
      customerId,
      workspaceId: request.auth.workspace.id,
      idempotencyKey,
      sendEmail,
      message: typeof message === 'string' ? message.trim() || null : null,
      requestedByUserId: request.auth.user.id,
      requestedByEmail: request.auth.user.email,
    });
  }

  @Get('payment-requests')
  @UseGuards(BearerAuthGuard)
  @ApiBearerAuth('bearer')
  findMany(@Req() request: AuthenticatedRequest) {
    return this.paymentRequestsService.findMany(request.auth.workspace.id);
  }

  @Get('payment-requests/:publicId')
  @UseGuards(BearerAuthGuard)
  @ApiBearerAuth('bearer')
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
  @ApiBearerAuth('bearer')
  findTimeline(
    @Param('publicId') publicId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentRequestsService.findTimeline(
      publicId,
      request.auth.workspace.id,
    );
  }

  @Get('pay/checkout-result')
  findCheckoutResult(@Query('session_id') sessionId: unknown) {
    if (
      typeof sessionId !== 'string' ||
      sessionId.length === 0 ||
      sessionId.length > 255
    ) {
      throw new BadRequestException('Checkout reference is required');
    }

    return this.paymentRequestsService.findCheckoutResult(sessionId);
  }

  @Get('pay/:publicId')
  findByPublicId(@Param('publicId') publicId: string) {
    return this.paymentRequestsService.findByPublicId(publicId);
  }
}
