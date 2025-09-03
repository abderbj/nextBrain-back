import { Controller, Post, Body, Get, Delete, Param, UploadedFile, UseInterceptors, ParseIntPipe, UseGuards, Query, Req, Res, Patch } from '@nestjs/common';
import { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from './knowledge.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('admin/knowledge')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class KnowledgeController {
  constructor(private svc: KnowledgeService, private uploader: FileUploadService) {}

  @Post('categories')
  async createCategory(@Body('name') name: string) {
    return this.svc.createCategory(name);
  }

  @Get('categories')
  async listCategories() {
    return this.svc.listCategories();
  }

  // Public categories endpoint (non-admin users) accessible at /knowledge/categories
  // This allows normal users to fetch available knowledge categories for RAG assistants.
  // Note: intentionally left unauthenticated so it can be used by the frontend without admin privileges.
  // Path: GET /knowledge/categories
  @Get('..public.categories.placeholder..')
  async publicListCategoriesPlaceholder() {
    // placeholder - replaced by the separate public controller registration in bootstrap
    return this.svc.listCategories();
  }

  @Get('files')
  async listFiles(
    @Query('category_id') categoryIdRaw?: string,
    @Query('sort') sort?: string,
    @Query('direction') direction?: 'asc' | 'desc',
    @Query('search') search?: string,
    @Query('tags') tagsRaw?: string,
  ) {
    // Debugging: log incoming raw query params
    console.log('[KnowledgeController] listFiles called with raw params:', { categoryIdRaw, sort, direction, search, tagsRaw });
    let categoryId: number | undefined = undefined;
    if (typeof categoryIdRaw !== 'undefined' && categoryIdRaw !== null && String(categoryIdRaw).trim() !== '') {
      const n = parseInt(String(categoryIdRaw), 10);
      if (!Number.isNaN(n)) categoryId = n;
    }

    let tags: string[] | undefined = undefined;
    if (typeof tagsRaw === 'string' && tagsRaw.trim() !== '') {
      try {
        // allow comma separated or JSON array
        if (tagsRaw.trim().startsWith('[')) tags = JSON.parse(tagsRaw);
        else tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean);
      } catch (e) {
        tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    return this.svc.listFiles({ categoryId, sort, direction, search, tags });
  }

  @Get('files/by-category')
  async listFilesByCategoryAdmin() {
    return this.svc.listFilesByCategory();
  }

  @Delete('categories/:id')
  async deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteCategory(id);
  }

  @Post('categories/:id')
  async updateCategory(@Param('id', ParseIntPipe) id: number, @Body('name') name: string) {
    return this.svc.updateCategory(id, name);
  }

  @Post('files')
  @UseInterceptors(FileInterceptor('file', FileUploadService.createMulterOptions('./uploads', 'file', 10 * 1024 * 1024, /./)))
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Body('category_id', ParseIntPipe) categoryId: number, @Req() req: Request) {
    // Debugging: log received body and parsed category id
    console.log('[KnowledgeController] uploadFile called. parsed category_id=', categoryId);
    try {
      console.log('[KnowledgeController] req.body keys=', Object.keys(req.body || {}));
    } catch (e) {
      console.warn('[KnowledgeController] could not read req.body', e?.message || e);
    }
    // category_id is required. Frontend should send the currently selected category id.
    return this.svc.uploadFile(file, categoryId);
  }

  @Delete('files/:id')
  async deleteFile(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteFile(id);
  }

  @Get('files/:id/preview')
  async previewFile(@Param('id', ParseIntPipe) id: number) {
    // returns a shareable URL or file metadata for preview
    return this.svc.getFileShareUrl(id);
  }

  @Get('files/:id/download')
  async downloadFile(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const result = await this.svc.downloadFile(id);
    if (!result) {
      return res.status(404).json({ message: 'File not found' });
    }
    if (result.stream) {
      res.setHeader('Content-Type', result.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${result.name || 'file'}"`);
      result.stream.pipe(res);
      return;
    }
    // fallback: redirect to stored path (could be URL)
    return res.redirect(result.url);
  }

  @Post('files/:id/share')
  async shareFile(@Param('id', ParseIntPipe) id: number) {
    return this.svc.shareFile(id);
  }

  @Patch('files/:id/rename')
  async renameFile(@Param('id', ParseIntPipe) id: number, @Body('name') name: string) {
    return this.svc.renameFile(id, name);
  }
      }

