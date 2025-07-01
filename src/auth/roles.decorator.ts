import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const RolesDecorator = (...roles: Role[]) =>
  SetMetadata(ROLES_KEY, roles);

// Alias for better readability
export const Roles = RolesDecorator;