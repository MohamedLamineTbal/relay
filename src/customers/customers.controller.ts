import { Body, Controller, Post } from '@nestjs/common';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(
    @Body() body: { name: string; email?: string; userId: number },
  ) {
    return this.customersService.create(
      body.name,
      body.email,
      body.userId,
    );
  }
}