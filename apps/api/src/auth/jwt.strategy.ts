import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { AuthContext } from '../common/decorators/auth.decorators';
import { User } from '../users/user.entity';
import { JwtPayload } from './token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
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
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }
    return {
      userId: user.id,
      role: user.role,
      phone: user.phone,
      status: user.status,
    };
  }
}