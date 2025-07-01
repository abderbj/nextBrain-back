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
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${fieldName}-${uniqueSuffix}${ext}`);
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