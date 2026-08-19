import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  BearerAuthGuard,
  type AuthenticatedRequest,
} from '../auth/bearer-auth.guard';
import { PaymentEmailsService } from './payment-emails.service';
import { SendPaymentEmailDto } from './payment-email.dto';

@Controller('payment-requests/:publicId/email-deliveries')
@ApiTags('Payment emails')
export class PaymentEmailsController {
  constructor(private readonly paymentEmails: PaymentEmailsService) {}

  @Get()
  @UseGuards(BearerAuthGuard)
  @ApiBearerAuth('bearer')
  list(
    @Param('publicId') paymentPublicId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentEmails.list(paymentPublicId, request.auth.workspace.id);
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(BearerAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique key for safely retrying this email request',
  })
  @ApiBody({ type: SendPaymentEmailDto })
  queue(
    @Param('publicId') paymentPublicId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'Idempotency-Key header is required for payment email delivery',
      );
    }

    if (idempotencyKey.trim().length === 0 || idempotencyKey.length > 200) {
      throw new BadRequestException(
        'Idempotency-Key must be between 1 and 200 characters',
      );
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException('Payment email request body is required');
    }

    const ownerMessage = (body as Record<string, unknown>).message;
    const recipient = (body as Record<string, unknown>).recipient ?? 'ORIGINAL';
    const emailBody = body as Record<string, unknown>;
    if (
      ['html', 'attachments', 'from', 'sender', 'subject'].some(
        (field) => field in emailBody,
      )
    ) {
      throw new BadRequestException('Custom email content is not supported');
    }
    if (
      ownerMessage !== undefined &&
      (typeof ownerMessage !== 'string' || ownerMessage.length > 500)
    ) {
      throw new BadRequestException(
        'Message must be a string no longer than 500 characters',
      );
    }

    if (recipient !== 'ORIGINAL' && recipient !== 'CURRENT') {
      throw new BadRequestException('Recipient must be ORIGINAL or CURRENT');
    }

    if (
      typeof ownerMessage === 'string' &&
      /(?:https?:\/\/|www\.)/i.test(ownerMessage)
    ) {
      throw new BadRequestException('Message cannot contain links');
    }

    return this.paymentEmails.queue({
      paymentPublicId,
      workspaceId: request.auth.workspace.id,
      requestedByUserId: request.auth.user.id,
      requestedByEmail: request.auth.user.email,
      idempotencyKey,
      ownerMessage: ownerMessage?.trim() || null,
      recipient,
    });
  }
}
