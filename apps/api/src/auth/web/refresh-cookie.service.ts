import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { TokenService } from '../token.service';

/** Name of the web refresh-token cookie (WQ-8). */
export const REFRESH_COOKIE_NAME = 'nitume_rt';

/**
 * WQ-8 (owner, 2026-10-28): on the website the refresh token lives only in
 * an httpOnly cookie, never in JavaScript. The cookie is:
 * - `HttpOnly`, `SameSite=Strict`;
 * - `Secure` everywhere except NODE_ENV=development (plain-http localhost);
 * - scoped to `/<apiPrefix>/auth/web`, so the browser sends it only to the
 *   web refresh / sign-out routes, never to the rest of the API;
 * - `Max-Age` = the refresh token lifetime (jwt.refreshTtl), unchanged.
 */
@Injectable()
export class RefreshCookieService {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: TokenService,
  ) {}

  /** Cookie attributes shared by set and clear (a clear must match name + path). */
  baseOptions(): CookieOptions {
    const prefix = this.config.get<string>('apiPrefix', 'api/v1').replace(/^\/+|\/+$/g, '');
    return {
      httpOnly: true,
      secure: this.config.get<string>('nodeEnv', 'development') !== 'development',
      sameSite: 'strict',
      path: `/${prefix}/auth/web`,
    };
  }

  set(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...this.baseOptions(),
      maxAge: this.tokens.refreshTtlSeconds() * 1000,
    });
  }

  clear(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, this.baseOptions());
  }

  /** The refresh token from the Cookie header, or null (no cookie-parser needed). */
  read(req: Pick<Request, 'headers'>): string | null {
    const header = req.headers.cookie;
    if (typeof header !== 'string' || header === '') {
      return null;
    }
    for (const part of header.split(';')) {
      const eq = part.indexOf('=');
      if (eq < 0 || part.slice(0, eq).trim() !== REFRESH_COOKIE_NAME) {
        continue;
      }
      const raw = part.slice(eq + 1).trim();
      if (raw === '') {
        return null;
      }
      try {
        return decodeURIComponent(raw);
      } catch {
        return null;
      }
    }
    return null;
  }
}
