import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { UserRole } from '../common/enums';
import { User } from '../users/user.entity';
import { escapeGlob, RedisService } from '../infra/redis/redis.service';

export type TokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  role: string;
  phone: string;
  type: TokenType;
  jti?: string;
  /** Issued-at, whole seconds (set by jsonwebtoken on sign). */
  iat?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** The 401 message of a refresh session that was rotated, revoked or expired. */
export const REFRESH_REVOKED_MESSAGE = 'Refresh token revoked or expired';

const refreshSessionKey = (userId: string, jti: string): string =>
  `refresh:${userId}:${jti}`;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  signAccessToken(user: Pick<User, 'id' | 'role' | 'phone'>): string {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      phone: user.phone,
      type: 'access',
    };
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret') as string,
      expiresIn: this.config.get<string>('jwt.accessTtl', '15m') as SignOptions['expiresIn'],
    });
  }

  async signRefreshToken(user: Pick<User, 'id' | 'role' | 'phone'>): Promise<string> {
    const jti = randomUUID();
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      phone: user.phone,
      type: 'refresh',
      jti,
    };
    const token = this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.refreshSecret') as string,
      expiresIn: this.config.get<string>('jwt.refreshTtl', '30d') as SignOptions['expiresIn'],
    });
    // Refresh sessions are stored hashed (SHA-256) in Redis; the raw JWT is
    // only ever held by the client.
    await this.redis.set(
      refreshSessionKey(user.id, jti),
      this.hashToken(token),
      this.refreshTtlSeconds(),
    );
    return token;
  }

  async issueTokenPair(user: Pick<User, 'id' | 'role' | 'phone'>): Promise<TokenPair> {
    return {
      accessToken: this.signAccessToken(user),
      refreshToken: await this.signRefreshToken(user),
    };
  }

  /**
   * Checks a refresh token is well-formed, signed and still a live session
   * (not rotated or revoked) without consuming it. Returns its payload.
   */
  async verifyRefresh(refreshToken: string): Promise<JwtPayload & { jti: string }> {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret') as string,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh' || !payload.jti || !payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const stored = await this.redis.get(refreshSessionKey(payload.sub, payload.jti));
    if (!stored || stored !== this.hashToken(refreshToken)) {
      throw new UnauthorizedException(REFRESH_REVOKED_MESSAGE);
    }
    return { ...payload, jti: payload.jti };
  }

  /** Verify + rotate a refresh token; returns a fresh token pair. */
  async rotate(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verifyRefresh(refreshToken);
    // Rotation: the used refresh token is single-use.
    await this.redis.del(refreshSessionKey(payload.sub, payload.jti));
    return this.issueTokenPair({
      id: payload.sub,
      role: payload.role as UserRole,
      phone: payload.phone,
    });
  }

  /** Revoke a refresh session, e.g. on logout. */
  async revoke(refreshToken: string): Promise<void> {
    try {
      const payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret') as string,
      });
      if (payload.jti) {
        await this.redis.del(refreshSessionKey(payload.sub, payload.jti));
      }
    } catch {
      // Unknown/expired token — nothing to revoke.
    }
  }

  /**
   * Issue #24 (owner WQ-23, 2026-10-28): revokes every refresh session of a
   * user (mobile and web share the `refresh:{userId}:{jti}` store), so a
   * suspended or banned account keeps no session and a reactivated one must
   * sign in again with OTP. Returns how many sessions were revoked.
   */
  async revokeAllForUser(userId: string): Promise<number> {
    if (!userId) {
      return 0;
    }
    return this.redis.deleteMatching(refreshSessionKey(escapeGlob(userId), '*'));
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Refresh token lifetime (jwt.refreshTtl) in seconds; also the web cookie Max-Age. */
  refreshTtlSeconds(): number {
    const ttl = this.config.get<string>('jwt.refreshTtl', '30d');
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) {
      return 30 * 24 * 60 * 60;
    }
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    };
    return Number.parseInt(match[1], 10) * multipliers[match[2]];
  }
}