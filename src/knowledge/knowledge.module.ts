import { Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { ConfigModule } from '@nestjs/config';
import { FileUploadService } from '../file-upload/file-upload.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [ConfigModule, HttpModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, FileUploadService, PrismaService],
})
export class KnowledgeModule {}
