import { Controller, Post, Body, Get, Delete, Param, UploadedFile, UseInterceptors, ParseIntPipe, UseGuards, Query, Req } from '@nestjs/common';
import { Request } from 'express';
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

  @Get('files')
  async listFiles(@Query('category_id') categoryIdRaw?: string) {
    // Debugging: log incoming raw query param
    console.log('[KnowledgeController] listFiles called with raw category_id=', categoryIdRaw);
    let categoryId: number | undefined = undefined;
    if (typeof categoryIdRaw !== 'undefined' && categoryIdRaw !== null && String(categoryIdRaw).trim() !== '') {
      const n = parseInt(String(categoryIdRaw), 10);
      if (!Number.isNaN(n)) categoryId = n;
    }
    // If categoryId is provided, service will filter; otherwise return all files
    return this.svc.listFiles(categoryId);
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
}

