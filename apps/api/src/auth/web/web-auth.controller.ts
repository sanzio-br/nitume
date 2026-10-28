import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiError } from '../../common/api-error';
import { Public } from '../../common/decorators/auth.decorators';
import { PublicUser } from '../../users/users.service';
import { AuthService } from '../auth.service';
import { EmailOtpVerifyDto, OtpVerifyDto } from '../dto/auth.dto';
import {
  OtpThrottleBucket,
  OtpThrottlerGuard,
  ThrottleOtpVerify,
} from '../otp-throttler.guard';
import { TokenPair } from '../token.service';
import { RefreshCookieService } from './refresh-cookie.service';
import { WebOriginGuard } from './web-origin.guard';

/** Web sign-in result: the access token only; the refresh token is the cookie. */
export interface WebSession {
  user: PublicUser;
  tokens: { accessToken: string };
}

const refreshCookieMissing = (): ApiError =>
  new ApiError(HttpStatus.UNAUTHORIZED, 'refresh_cookie_missing', 'No refresh session cookie');

/**
 * WQ-8 (owner, 2026-10-28): website auth. Same checks and services as
 * `/auth/*` (mobile, unchanged); the refresh token is set, rotated and
 * cleared as an httpOnly cookie instead of travelling in the JSON body, so
 * the website holds the access token in memory only. Every route requires an
 * allowed `Origin` (WebOriginGuard).
 */
@Controller('auth/web')
@UseGuards(WebOriginGuard)
export class WebAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookie: RefreshCookieService,
  ) {}

  @Public()
  @Post('otp/verify')
  @UseGuards(OtpThrottlerGuard)
  @ThrottleOtpVerify()
  @OtpThrottleBucket('AuthController-verifyOtp')
  async verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WebSession> {
    const result = await this.auth.verifyOtpAndLogin({
      phone: dto.phone,
      code: dto.code,
      role: dto.role,
    });
    return this.startSession(res, result);
  }

  @Public()
  @Post('otp/email/verify')
  @UseGuards(OtpThrottlerGuard)
  @ThrottleOtpVerify()
  @OtpThrottleBucket('AuthController-verifyEmailOtp')
  async verifyEmailOtp(
    @Body() dto: EmailOtpVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WebSession> {
    const result = await this.auth.verifyEmailOtpAndLogin({ email: dto.email, code: dto.code });
    return this.startSession(res, result);
  }

  /** Rotates the cookie exactly like `/auth/refresh`; any failure clears it. */
  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const current = this.cookie.read(req);
    if (!current) {
      throw refreshCookieMissing();
    }
    let pair: TokenPair;
    try {
      pair = await this.auth.refresh(current);
    } catch (err) {
      this.cookie.clear(res);
      if (err instanceof HttpException && err.getStatus() === 401) {
        throw new ApiError(HttpStatus.UNAUTHORIZED, 'refresh_invalid', err.message);
      }
      throw err;
    }
    this.cookie.set(res, pair.refreshToken);
    return { accessToken: pair.accessToken };
  }

  /**
   * Revokes the cookie's refresh session (as `/auth/logout` does) and clears
   * the cookie. Authenticated by the cookie itself, not a bearer token: the
   * website may have lost its in-memory access token (reload) and must still
   * be able to sign out. Without a cookie it only clears.
   */
  @Public()
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const current = this.cookie.read(req);
    this.cookie.clear(res);
    if (current) {
      return this.auth.logout(current);
    }
    return { message: 'Signed out' };
  }

  private startSession(
    res: Response,
    result: { user: PublicUser; tokens: TokenPair },
  ): WebSession {
    this.cookie.set(res, result.tokens.refreshToken);
    return { user: result.user, tokens: { accessToken: result.tokens.accessToken } };
  }
}
