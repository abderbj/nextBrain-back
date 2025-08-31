import { Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { PublicKnowledgeController } from './public-knowledge.controller';
import { ConfigModule } from '@nestjs/config';
import { FileUploadModule } from '../file-upload/file-upload.module';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, HttpModule, PrismaModule, FileUploadModule],
  controllers: [KnowledgeController, PublicKnowledgeController],
  providers: [KnowledgeService],
})
export class KnowledgeModule {}
