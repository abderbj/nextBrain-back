import { Module } from '@nestjs/common';
import { LlamaController } from './llama.controller';
import { LlamaService } from './llama.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LlamaController],
  providers: [LlamaService]
})
export class LlamaModule {}
