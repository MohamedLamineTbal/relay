import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BearerAuthGuard } from './bearer-auth.guard';
import { WorkspaceController } from './workspace.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController, WorkspaceController],
  providers: [AuthService, BearerAuthGuard],
  exports: [AuthService, BearerAuthGuard],
})
export class AuthModule {}
