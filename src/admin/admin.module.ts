import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailService } from '../mail/mail.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [AdminService, EmailService],
})
export class AdminModule {}
