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

  async listFiles(opts?: { categoryId?: number; sort?: string; direction?: 'asc' | 'desc'; search?: string; tags?: string[] }) {
    const db = this.prisma as any;
    const categoryId = opts?.categoryId;
    const sort = opts?.sort;
    const direction = opts?.direction ?? 'desc';
    const search = opts?.search;
    const tags = opts?.tags;

    const where: any = {};
    if (typeof categoryId === 'number') where.category_id = categoryId;
    if (typeof search === 'string' && search.trim() !== '') {
      // basic search across name and original name
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
  // Tags filtering is applied in-memory below because DB column type may vary between deployments.

    // try to apply ordering where possible in DB; fallback to in-memory
    let rows: any[] = [];
    try {
      const orderBy: any = {};
      if (sort && ['name', 'id', 'created_at', 'updated_at', 'size'].includes(sort)) {
        // map friendly sort keys to DB columns
        if (sort === 'uploadedAt') orderBy['created_at'] = direction;
        else if (sort === 'lastModified') orderBy['updated_at'] = direction;
        else orderBy[sort] = direction;
      } else if (sort === 'name') {
        orderBy['name'] = direction;
      } else {
        orderBy['id'] = 'desc';
      }
      rows = await db.file.findMany({ where, orderBy });
    } catch (e) {
      // if DB ordering fails for unexpected fields, fallback to simple fetch
      rows = await db.file.findMany({ where, orderBy: { id: 'desc' } });
    }
    // Enrich each file with the fields the frontend expects (size, uploadedAt, lastModified, mimeType, type, url, metadata)
    const fs = await import('fs');
    const path = await import('path');

    const uploadDir = this.config.get('UPLOAD_DIR') || 'uploads';

    // load categories once to map id -> name
    const cats = await db.category.findMany();
    const catMap = new Map<number, string>(cats.map((c: any) => [c.id, c.name]));

  const toFileItem = async (r: any) => {
      const out: any = { ...r };
      let fileName = '';
      try {
        try {
          const parsed = new URL(String(r.path));
          fileName = path.basename(parsed.pathname);
        } catch (_) {
          fileName = path.basename(String(r.path));
        }

        const fullPath = path.isAbsolute(uploadDir) ? path.join(uploadDir, fileName) : path.join(process.cwd(), uploadDir, fileName);
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          out.size = Number(stats.size);
          out.uploadedAt = stats.ctime.toISOString();
          out.lastModified = stats.mtime.toISOString();
        } else {
          out.size = Number(r.size ?? 0);
          // fallback to DB timestamps if available; otherwise use now
          out.uploadedAt = r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString();
          out.lastModified = r.updated_at ? new Date(r.updated_at).toISOString() : out.uploadedAt;
        }

        const ext = path.extname(fileName).toLowerCase().replace('.', '');
        out.mimeType = ext === 'pdf' ? 'application/pdf' : (ext ? `application/${ext}` : (r.mimeType || 'application/octet-stream'));
        out.type = (ext ? ext.toUpperCase() : (r.type || 'FILE'));
      } catch (e) {
        out.size = Number(r.size ?? 0);
        out.uploadedAt = r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString();
        out.lastModified = r.updated_at ? new Date(r.updated_at).toISOString() : out.uploadedAt;
        out.mimeType = r.mimeType || 'application/octet-stream';
        out.type = r.type || 'FILE';
      }

      // Construct a frontend-friendly file item
      const fileItem = {
        id: String(r.id),
        name: r.name,
        originalName: r.name,
        size: Number(out.size ?? 0),
        type: out.type,
        mimeType: out.mimeType,
        url: r.path,
        thumbnailUrl: null,
        uploadedBy: r.uploaded_by ?? 'admin',
        uploadedAt: out.uploadedAt,
        lastModified: out.lastModified,
        projectId: r.project_id ?? null,
        folderId: r.folder_id ?? null,
        tags: r.tags ?? [],
        metadata: {
          category: catMap.get(r.category_id) ?? String(r.category_id),
          version: 1,
          checksum: r.checksum ?? ''
        },
        isShared: false,
        sharedWith: [],
        downloadCount: Number(r.download_count ?? 0),
        status: 'ready'
      };

      return fileItem;
    };

    let items = await Promise.all(rows.map(r => toFileItem(r)));

    // client-side filtering for fields not available in DB ordering (type, size, etc.)
    if (sort && !['id', 'name', 'created_at', 'updated_at'].includes(sort)) {
      const dir = direction === 'asc' ? 1 : -1;
      items = items.sort((a: any, b: any) => {
        const A = (a as any)[sort] ?? '';
        const B = (b as any)[sort] ?? '';
        if (typeof A === 'number' && typeof B === 'number') return (A - B) * dir;
        return String(A).localeCompare(String(B)) * dir;
      });
    }

    // if tags filter was provided but DB doesn't support hasSome, apply simple filter
    if (Array.isArray(tags) && tags.length > 0) {
      items = items.filter((it: any) => {
        const t = Array.isArray(it.tags) ? it.tags : [];
        return tags.every(tag => t.includes(tag));
      });
    }

    return items;
  }

  /**
   * Return files grouped by category. Includes uncategorized files under category_id = null.
   */
  async listFilesByCategory() {
    const db = this.prisma as any;

    // Fetch categories
    const cats = await db.category.findMany();

    const categoriesOut: any[] = [];

    for (const c of cats) {
      const rows = await db.file.findMany({ where: { category_id: c.id }, orderBy: { id: 'desc' } });
      const files = rows.map((r: any) => ({ id: String(r.id), name: r.name, url: r.path, size: Number(r.size ?? 0), uploadedAt: r.created_at ? new Date(r.created_at).toISOString() : null, lastModified: r.updated_at ? new Date(r.updated_at).toISOString() : null }));
      categoriesOut.push({ category_id: c.id, category_name: c.name, file_count: files.length, files });
    }

    // Add uncategorized files (category_id is null)
    const uncategorizedRows = await db.file.findMany({ where: { category_id: null }, orderBy: { id: 'desc' } });
    if (uncategorizedRows && uncategorizedRows.length > 0) {
      const files = uncategorizedRows.map((r: any) => ({ id: String(r.id), name: r.name, url: r.path, size: Number(r.size ?? 0), uploadedAt: r.created_at ? new Date(r.created_at).toISOString() : null, lastModified: r.updated_at ? new Date(r.updated_at).toISOString() : null }));
      categoriesOut.push({ category_id: null, category_name: null, file_count: files.length, files });
    }

    return { total_categories: categoriesOut.length, categories: categoriesOut };
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
    // Build an absolute path to the uploaded file so the RAG service can access it
    const uploadDir = this.config.get('UPLOAD_DIR') || 'uploads';
    const path = await import('path');
    const fs = await import('fs');
    const absolutePath = path.isAbsolute(uploadDir)
      ? path.join(uploadDir, file.filename)
      : path.join(process.cwd(), uploadDir, file.filename);

    // Determine rag base and candidate hosts to try (helps in docker / host networking)
    const configured = this.config.get('RAG_SERVICE_URL');
    const normalized = typeof configured === 'string' && configured.trim() !== ''
      ? configured.replace(/\/+$/g, '')
      : '';

    const candidates: string[] = [];
    if (normalized) {
      // allow either full ingest path or base URL
      if (normalized.endsWith('/ingest')) candidates.push(normalized);
      else candidates.push(`${normalized}/ingest`);
    }

    // Common host variants to try when running locally / in docker-compose
    candidates.push('http://host.docker.internal:8001/ingest');
    candidates.push('http://127.0.0.1:8001/ingest');
    candidates.push('http://localhost:8001/ingest');
    // internal service name used in compose networks
    candidates.push('http://rag-service:8001/ingest');

    // de-duplicate while preserving order
    const seen = new Set<string>();
    const uniqueCandidates = candidates.filter(u => {
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    });

  // Build multipart/form-data payload with the uploaded file so RAG receives an UploadFile
  const FormData = (await import('form-data')).default;

    const form = new FormData();
    try {
      if (!fs.existsSync(absolutePath)) {
        console.warn('[KnowledgeService] Uploaded file not found on disk for RAG ingest:', absolutePath);
      } else {
        form.append('file', fs.createReadStream(absolutePath), { filename: file.originalname });
        form.append('category_id', String(categoryId));
        // include optional file_id for debugging/tracking
        form.append('file_id', String(created.id));

        let ingested = false;
        for (const url of uniqueCandidates) {
          try {
            const headers = Object.assign({}, form.getHeaders());
            // ensure cookies/auth are not leaked; use JSON timeout options for HttpService
            const resp$ = this.httpService.post(url, form, { headers, timeout: 15000, maxContentLength: Infinity, maxBodyLength: Infinity });
            const resp = await firstValueFrom(resp$);
            console.log(`[KnowledgeService] RAG ingest succeeded using ${url}`, resp?.data ?? resp?.status ?? resp);
            ingested = true;
            break;
          } catch (err) {
            console.warn(`[KnowledgeService] RAG ingest attempt failed for ${url}:`, err?.message || err?.toString());
            // try next candidate
          }
        }

        if (!ingested) {
          console.warn('[KnowledgeService] All RAG ingest attempts failed - file indexed later retries may be required', {
            file: created.id,
            path: absolutePath,
            category_id: categoryId,
          });
        }
      }
    } catch (e) {
      console.warn('[KnowledgeService] Error preparing file stream for RAG ingest:', e && (e as any).message ? (e as any).message : e);
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

  // Return frontend-friendly shape
  // reuse listFiles mapping logic by fetching the updated record and transforming
  const rows = await db.file.findMany({ where: { id: Number(id) } });
  if (!rows || rows.length === 0) return f;
  const mapped = await this.listFiles();
  // find by id and return the transformed item if present
  const found = mapped.find((it: any) => Number(it.id) === Number(id) || String(it.id) === String(id));
  return found || f;
  }

  async deleteFile(id: number) {
  const db = this.prisma as any;
  const f = await db.file.findUnique({ where: { id } });
    if (!f) throw new HttpException('File not found', HttpStatus.NOT_FOUND);
    // attempt to remove file from disk
    try {
      const fs = await import('fs');
      const path = await import('path');
      const uploadDir = this.config.get('UPLOAD_DIR') || 'uploads';
      const filename = path.basename(String(f.path));
      const fullPath = path.isAbsolute(uploadDir) ? path.join(uploadDir, filename) : path.join(process.cwd(), uploadDir, filename);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (e) {
          // log and continue to delete DB record
          console.warn('Failed to unlink file on delete:', e && (e as any).message ? (e as any).message : e);
        }
      }
    } catch (e) {
      // non-fatal — continue
      console.warn('Error while attempting to remove file from disk:', e && (e as any).message ? (e as any).message : e);
    }

    // delete DB record
    await db.file.delete({ where: { id } });
    return { deleted: true, removedFromDisk: true, url: f.path };
  }
}

