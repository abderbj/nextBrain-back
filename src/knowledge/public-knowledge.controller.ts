import { Controller, Get } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge')
export class PublicKnowledgeController {
  constructor(private svc: KnowledgeService) {}

  @Get('categories')
  async listCategories() {
    return this.svc.listCategories();
  }

  @Get('files/by-category')
  async listFilesByCategoryPublic() {
    return this.svc.listFilesByCategory();
  }
}
