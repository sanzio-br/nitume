import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole, UserStatus } from '../common/enums';
import { User } from './user.entity';

export interface PublicUser {
  id: string;
  phone: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
}

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  phone: user.phone,
  email: user.email,
  role: user.role,
  status: user.status,
  createdAt: user.createdAt,
});

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async create(data: {
    phone: string;
    email?: string | null;
    passwordHash?: string | null;
    role: UserRole;
  }): Promise<User> {
    const user = this.users.create({
      phone: data.phone,
      email: data.email ?? null,
      passwordHash: data.passwordHash ?? null,
      role: data.role,
      status: UserStatus.ACTIVE,
    });
    return this.users.save(user);
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.users.findOne({ where: { phone } });
  }

  async getPublicProfile(userId: string): Promise<PublicUser> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  async updateProfile(
    userId: string,
    data: { email?: string | null; passwordHash?: string | null },
  ): Promise<PublicUser> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (data.email !== undefined) {
      user.email = data.email ?? null;
    }
    if (data.passwordHash !== undefined) {
      user.passwordHash = data.passwordHash ?? null;
    }
    await this.users.save(user);
    return toPublicUser(user);
  }
}