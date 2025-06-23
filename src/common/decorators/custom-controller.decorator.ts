import { applyDecorators, Controller } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function ApiController(path: string) {
  return applyDecorators(
    ApiResponse({
      status: 429,
      description: 'Too many requests',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
    Controller(path),
  );
}
