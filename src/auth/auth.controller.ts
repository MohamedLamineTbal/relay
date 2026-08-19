import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthDto } from './auth.dto';

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: AuthDto) {
    return this.authService.register(body.email, body.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: AuthDto) {
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      !('email' in body) ||
      typeof body.email !== 'string' ||
      body.email.trim().length === 0 ||
      !('password' in body) ||
      typeof body.password !== 'string' ||
      body.password.length === 0
    ) {
      throw new BadRequestException('Email and password are required');
    }

    return this.authService.login(body.email, body.password);
  }
}
