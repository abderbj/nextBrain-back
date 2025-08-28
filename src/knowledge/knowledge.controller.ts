import { Controller, Post, Body, Get, Delete, Param, UploadedFile, UseInterceptors, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from './knowledge.service';
import { FileUploadService } from '../file-upload/file-upload.service';

@Controller('admin/knowledge')
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

  @Delete('categories/:id')
  async deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteCategory(id);
  }

  @Post('files')
  @UseInterceptors(FileInterceptor('file', FileUploadService.createMulterOptions('./uploads', 'file', 10 * 1024 * 1024, /./)))
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Body('category_id') categoryId: number) {
    return this.svc.uploadFile(file, categoryId);
  }

  @Delete('files/:id')
  async deleteFile(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteFile(id);
  }
}
