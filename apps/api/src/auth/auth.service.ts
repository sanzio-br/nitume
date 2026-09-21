import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../common/enums';
import { CustomersService } from '../customers/customers.service';
import { RunnersService } from '../runners/runners.service';
import { PublicUser, toPublicUser, UsersService } from '../users/users.service';
import { OtpService } from './otp.service';
import { TokenPair, TokenService } from './token.service';

const LEGACY_BUSINESS_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.BUSINESS];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly customers: CustomersService,
    private readonly runners: RunnersService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  /** Explicit signup. Admin/business account creation is out of scope for the API. */
  async register(params: {
    phone: string;
    email?: string;
    password?: string;
    role: UserRole;
  }): Promise<{ user: PublicUser }> {
    if (LEGACY_BUSINESS_ROLES.includes(params.role)) {
      throw new UnauthorizedException('Admin and business accounts cannot be self-registered');
    }
    if (await this.users.findByPhone(params.phone)) {
      throw new ConflictException('An account with this phone number already exists');
    }
    const passwordHash = params.password
      ? await bcrypt.hash(params.password, this.passwordRounds())
      : null;

    const user = await this.users.create({
      phone: params.phone,
      email: params.email,
      passwordHash,
      role: params.role,
    });
    if (params.role === UserRole.RUNNER) {
      await this.runners.createForUser(user.id);
    } else {
      await this.customers.createForUser(user.id);
    }
    return { user: {
      id: user.id, phone: user.phone, email: user.email,
      role: user.role, status: user.status, createdAt: user.createdAt,
    } };
  }

  async requestOtp(phone: string): Promise<{ message: string }> {
    await this.otp.requestCode(phone);
    return { message: 'Verification code sent' };
  }

  /**
   * Email OTP — used by the admin login surface. Codes are only issued to
   * accounts that already exist as active admins (admins are provisioned via
   * `npm run seed:admin`, never self-registered).
   */
  async requestEmailOtp(email: string): Promise<{ message: string }> {
    const user = await this.users.findByEmail(email);
    if (!user || user.role !== UserRole.ADMIN || user.status !== 'active') {
      throw new UnauthorizedException('No active admin account is linked to this email');
    }
    await this.otp.requestEmailCode(email);
    return { message: 'Verification code sent' };
  }

  /** Verifies an emailed code for an existing active admin and issues tokens. */
  async verifyEmailOtpAndLogin(params: {
    email: string;
    code: string;
  }): Promise<{ user: PublicUser; tokens: TokenPair }> {
    await this.otp.verifyEmailCode(params.email, params.code);

    const user = await this.users.findByEmail(params.email);
    if (!user || user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('No admin account is linked to this email');
    }
    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is suspended or banned');
    }
    const tokens = await this.tokens.issueTokenPair(user);
    return { user: toPublicUser(user), tokens };
  }

  /**
   * Verifies the code, creating the account on first login (auto-onboarding),
   * then returns a token pair.
   */
  async verifyOtpAndLogin(params: {
    phone: string;
    code: string;
    role?: UserRole;
  }): Promise<{ user: PublicUser; tokens: TokenPair }> {
    await this.otp.verifyCode(params.phone, params.code);

    let user = await this.users.findByPhone(params.phone);
    if (!user) {
      const role = params.role ?? UserRole.CUSTOMER;
      if (LEGACY_BUSINESS_ROLES.includes(role)) {
        throw new UnauthorizedException('Admin and business accounts cannot be self-registered');
      }
      user = await this.users.create({ phone: params.phone, role });
      if (role === UserRole.RUNNER) {
        await this.runners.createForUser(user.id);
      } else {
        await this.customers.createForUser(user.id);
      }
    } else if (user.status !== 'active') {
      throw new UnauthorizedException('Account is suspended or banned');
    }
    const tokens = await this.tokens.issueTokenPair(user);
    return {
      user: {
        id: user.id, phone: user.phone, email: user.email,
        role: user.role, status: user.status, createdAt: user.createdAt,
      },
      tokens,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.tokens.revoke(refreshToken);
    return { message: 'Signed out' };
  }

  private passwordRounds(): number {
    return this.config.get<number>('security.bcryptRounds', 12);
  }
}