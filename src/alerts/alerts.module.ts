import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
