import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Injectable()
export class FileUploadService {
  constructor(private readonly configService: ConfigService) {}

  static createMulterOptions(
    destination: string,
    fieldName = 'file',
    fileSize: number,
    fileTypeRegex: RegExp,
  ): MulterOptions {
    return {
      storage: diskStorage({
        destination,
        filename: (req, file, cb) => {
          // sanitize original name (remove extension, replace spaces/unsafe chars)
          const original = file.originalname.replace(/\.[^/.]+$/, '');
          const safe = original
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
          const ext = extname(file.originalname);
          const random = Math.floor(Math.random() * 1e9);
          cb(null, `${safe}-${random}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(fileTypeRegex)) {
          return cb(new BadRequestException('Invalid file type'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize,
      },
    };
  }

  generateFilePath(file: Express.Multer.File, dir: string) {
    if (!file) throw new BadRequestException('File not found');

    return `${this.configService.get<string>('BASE_URL')}/uploads/${dir}/${file.filename}`;
  }
}