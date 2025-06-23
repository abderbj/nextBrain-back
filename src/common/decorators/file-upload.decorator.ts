import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { FileUploadService } from 'src/file-upload/file-upload.service';

export function FileUpload(
  fieldName: string,
  destination: string,
  fileSize = 1024 * 1024 * 1,
  fileTypeRegex = /\/(jpg|jpeg|png|webp)$/i,
  description = 'Upload file',
) {
  return applyDecorators(
    UseInterceptors(
      FileInterceptor(
        fieldName,
        FileUploadService.createMulterOptions(
          destination,
          fieldName,
          fileSize,
          fileTypeRegex,
        ),
      ),
    ),
    ApiOperation({ summary: description }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          [fieldName]: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    }),
  );
}
