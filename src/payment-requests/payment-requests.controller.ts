import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  BearerAuthGuard,
  type AuthenticatedRequest,
} from '../auth/bearer-auth.guard';
import { PaymentRequestsService } from './payment-requests.service';

@Controller()
export class PaymentRequestsController {
  constructor(
    private readonly paymentRequestsService: PaymentRequestsService,
  ) {}

  @Post('payment-requests')
  @UseGuards(BearerAuthGuard)
  create(
    @Body()
    body: {
      description: string;
      amount: number;
      customerId: number;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentRequestsService.create(
      body.description,
      body.amount,
      body.customerId,
      request.auth.workspace.id,
    );
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

  @Get('pay/:publicId')
  findByPublicId(@Param('publicId') publicId: string) {
    return this.paymentRequestsService.findByPublicId(publicId);
  }
}
