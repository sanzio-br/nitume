import { Body, Controller, Post } from '@nestjs/common';
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
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Public()
  @Post('otp/verify')
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.auth.verifyOtpAndLogin({
      phone: dto.phone,
      code: dto.code,
      role: dto.role,
    });
  }

  @Public()
  @Post('otp/email/request')
  requestEmailOtp(@Body() dto: EmailOtpRequestDto) {
    return this.auth.requestEmailOtp(dto.email);
  }

  @Public()
  @Post('otp/email/verify')
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