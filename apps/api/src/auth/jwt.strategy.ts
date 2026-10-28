import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { accountSuspended } from '../common/api-error';
import { AuthContext } from '../common/decorators/auth.decorators';
import { UserStatus } from '../common/enums';
import { UserAccessService } from '../users/user-access.service';
import { JwtPayload } from './token.service';

/**
 * Access-token check behind the global `JwtAuthGuard` (public routes skip
 * it). Issue #23 (WQ-20): a still-valid token of a suspended or banned
 * account is refused with 401 `account_suspended`, the body OTP verify and
 * refresh use. The status comes from the cached `UserAccessService`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly access: UserAccessService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret') as string,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthContext> {
    if (payload.type !== 'access' || !payload.sub) {
      throw new UnauthorizedException('Invalid token');
    }
    const user = await this.access.accessOf(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Account is not active');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw accountSuspended();
    }
    return {
      userId: payload.sub,
      role: user.role,
      phone: user.phone,
      status: user.status,
    };
  }
}
