import { SetMetadata } from '@nestjs/common';
import { StatusHistoryActor, UserRole } from '../enums';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

export interface AuthContext {
  userId: string;
  role: UserRole;
  phone: string;
  status: string;
}

export interface ActorContext {
  actorType: StatusHistoryActor;
  actorId?: string | null;
}