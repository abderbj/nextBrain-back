import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { FileUploadService } from '../file-upload/file-upload.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class KnowledgeService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private fileUpload: FileUploadService,
    private httpService: HttpService,
  ) {}

  async createCategory(name: string) {
  const db = this.prisma as any;
  return db.category.create({ data: { name } });
  }

  async listCategories() {
  const db = this.prisma as any;
  return db.category.findMany();
  }

  async deleteCategory(id: number) {
  const db = this.prisma as any;
  return db.category.delete({ where: { id } });
  }

  async uploadFile(file: Express.Multer.File, categoryId: number) {
    // save file path/metadata in DB
    const baseUrl = this.config.get('BASE_URL');
    const savedPath = `${baseUrl}/uploads/${file.filename}`; // keep URL-like path in DB

  const db = this.prisma as any;
  const created = await db.file.create({
      data: {
        name: file.originalname,
        path: savedPath,
        category_id: categoryId,
      },
    });

    // call rag-service to index the file
    const ragUrl = this.config.get('RAG_SERVICE_URL') || 'http://rag-service:8001/ingest';
    const ingestPath = this.config.get('UPLOAD_DIR')
      ? `${this.config.get('UPLOAD_DIR')}/${file.filename}`
      : `/uploads/${file.filename}`;

    try {
      const resp$ = this.httpService.post(ragUrl, {
        file_id: created.id,
        path: ingestPath,
        category_id: categoryId,
      });
      await firstValueFrom(resp$);
    } catch (err) {
      // swallow or log — indexing can be retried
      console.warn('RAG ingest failed:', err.message || err.toString());
    }

    return created;
  }

  async deleteFile(id: number) {
  const db = this.prisma as any;
  const f = await db.file.findUnique({ where: { id } });
    if (!f) throw new HttpException('File not found', HttpStatus.NOT_FOUND);
    // optionally remove file from disk
    // delete DB record
  await db.file.delete({ where: { id } });
    return { deleted: true };
  }
}
