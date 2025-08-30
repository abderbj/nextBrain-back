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

  async listFiles(categoryId?: number) {
    const db = this.prisma as any;
    const where = typeof categoryId === 'number' ? { category_id: categoryId } : {};
    const rows: any[] = await db.file.findMany({ where, orderBy: { id: 'desc' } });

    // Enrich each file with size, modifiedAt and mime/type where possible
    const fs = await import('fs');
    const path = await import('path');

    const uploadDir = this.config.get('UPLOAD_DIR') || 'uploads';

    return Promise.all(rows.map(async (r) => {
      const out: any = { ...r };
      try {
        // stored path is like /uploads/filename or full URL
        const fileName = (() => {
          try {
            const parsed = new URL(String(r.path));
            return path.basename(parsed.pathname);
          } catch (_) {
            return path.basename(String(r.path));
          }
        })();

        const fullPath = path.isAbsolute(uploadDir) ? path.join(uploadDir, fileName) : path.join(process.cwd(), uploadDir, fileName);
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          out.size = Number(stats.size);
          out.modifiedAt = stats.mtime.toISOString();
          // infer simple mime/type from extension
          const ext = path.extname(fileName).toLowerCase().replace('.', '');
          out.mimeType = ext === 'pdf' ? 'application/pdf' : (ext ? `application/${ext}` : 'application/octet-stream');
          out.type = ext.toUpperCase() || 'FILE';
        } else {
          // fallbacks when file is stored remotely or not found
          out.size = r.size ?? 0;
          out.modifiedAt = r.updated_at ? new Date(r.updated_at).toISOString() : null;
          out.mimeType = r.mimeType || null;
          out.type = r.type || null;
        }
      } catch (e) {
        out.size = r.size ?? 0;
        out.modifiedAt = r.updated_at ? new Date(r.updated_at).toISOString() : null;
        out.mimeType = r.mimeType || null;
        out.type = r.type || null;
      }

      return out;
    }));
  }

  async deleteCategory(id: number) {
  const db = this.prisma as any;
  return db.category.delete({ where: { id } });
  }

  async updateCategory(id: number, name: string) {
    const db = this.prisma as any;
    return db.category.update({ where: { id }, data: { name } });
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

  async getFileShareUrl(id: number) {
    const db = this.prisma as any;
    const f = await db.file.findUnique({ where: { id } });
    if (!f) return null;
    // If stored as URL return it, otherwise build from BASE_URL
    const baseUrl = this.config.get('BASE_URL') || '';
    const url = f.path?.startsWith('http') ? f.path : `${baseUrl}/uploads/${f.path?.split('/').pop()}`;
    return { url, id: f.id, name: f.name };
  }

  async downloadFile(id: number) {
    const db = this.prisma as any;
    const f = await db.file.findUnique({ where: { id } });
    if (!f) return null;
    const fs = await import('fs');
    const path = await import('path');
    const uploadDir = this.config.get('UPLOAD_DIR') || 'uploads';
    const filename = path.basename(String(f.path));
    const fullPath = path.isAbsolute(uploadDir) ? path.join(uploadDir, filename) : path.join(process.cwd(), uploadDir, filename);
    if (fs.existsSync(fullPath)) {
      const stream = fs.createReadStream(fullPath);
      return { stream, name: f.name, mimeType: f.mimeType || 'application/octet-stream' };
    }
    return { url: f.path, name: f.name, mimeType: f.mimeType || 'application/octet-stream' };
  }

  async shareFile(id: number) {
    // For now, return the same as getFileShareUrl; in future this could create signed URLs
    return this.getFileShareUrl(id);
  }

  async renameFile(id: number, name: string) {
    const db = this.prisma as any;
    const f = await db.file.update({ where: { id }, data: { name } });
    return f;
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

