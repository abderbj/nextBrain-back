import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { HashService } from 'src/common/services/hash.service';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [InvitationsController],
  providers: [InvitationsService, HashService],
})
export class InvitationsModule {}
