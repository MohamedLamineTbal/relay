import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  BearerAuthGuard,
  type AuthenticatedRequest,
} from '../auth/bearer-auth.guard';
import { CreateCustomerDto } from './customer.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
@UseGuards(BearerAuthGuard)
@ApiTags('Customers')
@ApiBearerAuth('bearer')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @ApiBody({ type: CreateCustomerDto })
  create(
    @Body()
    body: CreateCustomerDto & {
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

  @Get(':id/dossier')
  findDossier(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.customersService.findDossier(id, request.auth.workspace.id);
  }

  @Patch(':id')
  updateEmail(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      !('email' in body) ||
      typeof body.email !== 'string'
    ) {
      throw new BadRequestException('Email must be a valid email address');
    }

    const email = body.email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Email must be a valid email address');
    }

    return this.customersService.updateEmail(
      id,
      email,
      request.auth.workspace.id,
    );
  }
}
