import { Controller, Post, Body, Get, Delete, Param, UploadedFile, UseInterceptors, ParseIntPipe, UseGuards } from '@nestjs/common';
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
  async listFiles() {
    return this.svc.listFiles();
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
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Body('category_id', ParseIntPipe) categoryId: number) {
    return this.svc.uploadFile(file, categoryId);
  }

  @Delete('files/:id')
  async deleteFile(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteFile(id);
  }
}

