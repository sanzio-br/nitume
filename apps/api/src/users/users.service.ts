import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { escapeLike } from '../common/like';
import { UserRole, UserStatus } from '../common/enums';
import { User } from './user.entity';

export interface PublicUser {
  id: string;
  phone: string;
  email: string | null;
  /** Null until the user sets it (onboarding after first sign-in). */
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
}

/** What an authenticated request needs from the account (issue #23). */
export interface UserAccess {
  status: UserStatus;
  role: UserRole;
  phone: string;
}

/**
 * Issue #24 (U-1): what the admin Customer drawer shows of an account. The
 * phone is the full sign-in number (admins only).
 */
export interface AdminUserSummary {
  id: string;
  role: UserRole;
  status: UserStatus;
  /** Null until the user sets it. */
  displayName: string | null;
  phone: string;
}

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  phone: user.phone,
  email: user.email,
  displayName: user.displayName ?? null,
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

  /** Account status only (primary-key lookup, one column); null if no such user. */
  async statusOf(id: string): Promise<UserStatus | null> {
    const row = await this.users.findOne({ where: { id }, select: { id: true, status: true } });
    return row?.status ?? null;
  }

  /**
   * Status, role and phone only (primary-key lookup); null if no such user.
   * Uncached: request auth reads it through `UserAccessService`.
   */
  async accessOf(id: string): Promise<UserAccess | null> {
    const row = await this.users.findOne({
      where: { id },
      select: { id: true, status: true, role: true, phone: true },
    });
    return row ? { status: row.status, role: row.role, phone: row.phone } : null;
  }

  /** U-1 (issue #24): id, role, status, display name and phone; null if no such user. */
  async summaryOf(id: string): Promise<AdminUserSummary | null> {
    const row = await this.users.findOne({
      where: { id },
      select: { id: true, role: true, status: true, displayName: true, phone: true },
    });
    return row
      ? { id: row.id, role: row.role, status: row.status, displayName: row.displayName || null, phone: row.phone }
      : null;
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.users.findOne({ where: { phone } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  /** Ids of every active admin (admin notification fan-out, row 68). */
  async activeAdminIds(): Promise<string[]> {
    const rows = await this.users.find({
      where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      select: { id: true },
    });
    return rows.map((u) => u.id);
  }

  /**
   * Active accounts among `userIds`, keyed by id, with their display name
   * (null when unset). Suspended, banned and missing users are omitted.
   */
  async activeDisplayNames(userIds: string[]): Promise<Map<string, string | null>> {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) {
      return new Map();
    }
    const rows = await this.users.find({
      where: { id: In(unique), status: UserStatus.ACTIVE },
      select: { id: true, displayName: true },
    });
    return new Map(rows.map((u) => [u.id, u.displayName ?? null]));
  }

  /** Display names keyed by user id (missing users and unset names are omitted). */
  async displayNames(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) {
      return new Map();
    }
    const rows = await this.users.find({
      where: { id: In(unique) },
      select: { id: true, displayName: true },
    });
    return new Map(
      rows
        .filter((u) => u.displayName)
        .map((u) => [u.id, u.displayName as string]),
    );
  }

  /**
   * Sign-in phone and display name keyed by user id, in one query (missing
   * users are omitted). For admin lists that show who a runner is (row 260).
   */
  async contacts(userIds: string[]): Promise<Map<string, { phone: string | null; displayName: string | null }>> {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) {
      return new Map();
    }
    const rows = await this.users.find({
      where: { id: In(unique) },
      select: { id: true, phone: true, displayName: true },
    });
    return new Map(rows.map((u) => [u.id, { phone: u.phone ?? null, displayName: u.displayName || null }]));
  }

  /**
   * Row 278 (AV-2, admin verification search): ids of the users with `role`
   * whose display name contains `nameContains` (case-insensitive; LIKE
   * wildcards in it are matched literally) or, when `phoneDigits` is given,
   * whose sign-in phone contains those digits. Parameterised; one query.
   */
  async idsMatching(search: { nameContains: string; phoneDigits?: string | null; role: UserRole }): Promise<string[]> {
    const name = `%${escapeLike(search.nameContains)}%`;
    const digits = search.phoneDigits?.replace(/\D/g, '') ?? '';
    const rows = await this.users
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .where('u.role = :role', { role: search.role })
      .andWhere(
        new Brackets((qb) => {
          qb.where(`u."displayName" ILIKE :name ESCAPE '\\'`, { name });
          if (digits) {
            qb.orWhere('strpos(u.phone, :digits) > 0', { digits });
          }
        }),
      )
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
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
    data: {
      email?: string | null;
      passwordHash?: string | null;
      displayName?: string | null;
    },
  ): Promise<PublicUser> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (data.email !== undefined) {
      user.email = data.email ?? null;
    }
    if (data.displayName !== undefined) {
      const trimmed = data.displayName?.trim() ?? '';
      user.displayName = trimmed.length > 0 ? trimmed : null;
    }
    if (data.passwordHash !== undefined) {
      user.passwordHash = data.passwordHash ?? null;
    }
    await this.users.save(user);
    return toPublicUser(user);
  }
}