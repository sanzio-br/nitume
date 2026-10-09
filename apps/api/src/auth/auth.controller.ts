import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthContext, Public } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import {
  EmailOtpRequestDto,
  EmailOtpVerifyDto,
  OtpRequestDto,
  OtpVerifyDto,
  RefreshTokenDto,
  RegisterDto,
} from './dto/auth.dto';
import { TokenPair } from './token.service';
import {
  OTP_REQUEST_THROTTLER,
  OTP_VERIFY_THROTTLER,
  OtpThrottlerGuard,
} from './otp-throttler.guard';

/** Per-IP limit on issuing codes (row 53). */
const ThrottleOtpRequest = () => SkipThrottle({ [OTP_VERIFY_THROTTLER]: true });
/** Per-IP limit on verifying codes (row 53). */
const ThrottleOtpVerify = () => SkipThrottle({ [OTP_REQUEST_THROTTLER]: true });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register({
      phone: dto.phone,
      email: dto.email,
      password: dto.password,
      role: dto.role,
    });
  }

  @Public()
  @Post('otp/request')
  @UseGuards(OtpThrottlerGuard)
  @ThrottleOtpRequest()
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Public()
  @Post('otp/verify')
  @UseGuards(OtpThrottlerGuard)
  @ThrottleOtpVerify()
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.auth.verifyOtpAndLogin({
      phone: dto.phone,
      code: dto.code,
      role: dto.role,
    });
  }

  @Public()
  @Post('otp/email/request')
  @UseGuards(OtpThrottlerGuard)
  @ThrottleOtpRequest()
  requestEmailOtp(@Body() dto: EmailOtpRequestDto) {
    return this.auth.requestEmailOtp(dto.email);
  }

  @Public()
  @Post('otp/email/verify')
  @UseGuards(OtpThrottlerGuard)
  @ThrottleOtpVerify()
  verifyEmailOtp(@Body() dto: EmailOtpVerifyDto) {
    return this.auth.verifyEmailOtpAndLogin({ email: dto.email, code: dto.code });
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthContext, @Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }
}