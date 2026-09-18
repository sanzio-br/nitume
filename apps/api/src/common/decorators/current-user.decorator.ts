import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthContext } from './auth.decorators';

/**
 * Extracts the authenticated user (JWT payload) attached by JwtStrategy.
 * Requires the route to be JWT-protected.
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthContext }>();
    return request.user;
  },
);