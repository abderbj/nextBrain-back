import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../roles.decorator'
import { Role } from '@prisma/client'
import { RequestWithUser } from 'src/common/types/auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // Check if user exists and has a role - if not, deny access
    if (!user || !user.role) {
      return false;
    }
    console.log('Required roles:', requiredRoles);
    console.log('User role:', user.role);
    console.log('Comparison:', requiredRoles.map(String).includes(String(user.role)));
    // Normalize both to string for comparison
    return requiredRoles.map(String).includes(String(user.role));
  }
}