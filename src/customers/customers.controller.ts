import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  BearerAuthGuard,
  type AuthenticatedRequest,
} from '../auth/bearer-auth.guard';
import { CustomersService } from './customers.service';

@Controller('customers')
@UseGuards(BearerAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(
    @Body()
    body: {
      name: string;
      email?: string;
      userId?: unknown;
      workspaceId?: unknown;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    if ('userId' in body || 'workspaceId' in body) {
      throw new BadRequestException(
        'Customer ownership is derived from authentication',
      );
    }

    return this.customersService.create(
      body.name,
      body.email,
      request.auth.workspace.id,
    );
  }

  @Get()
  findMany(@Req() request: AuthenticatedRequest) {
    return this.customersService.findMany(request.auth.workspace.id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.customersService.findOne(id, request.auth.workspace.id);
  }
}
