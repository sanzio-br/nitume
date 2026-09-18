import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { UserRole } from '../common/enums';
import { User } from '../users/user.entity';
import { RedisService } from '../infra/redis/redis.service';

export type TokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  role: string;
  phone: string;
  type: TokenType;
  jti?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

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

  /** Verify + rotate a refresh token; returns a fresh token pair. */
  async rotate(refreshToken: string): Promise<TokenPair> {
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
      throw new UnauthorizedException('Refresh token revoked or expired');
    }
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

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTtlSeconds(): number {
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