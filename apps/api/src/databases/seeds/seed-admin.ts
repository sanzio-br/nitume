/**
 * Idempotent admin account seeder.
 *
 * Usage: `npm run seed:admin` (ts-node).
 *
 * Admin accounts cannot self-register through the public API (§3.2 register
 * rejects admin/business roles); they are provisioned through this script.
 * Reads ADMIN_SEED_PHONE / ADMIN_SEED_PASSWORD / ADMIN_SEED_EMAIL from env.
 */
import 'reflect-metadata';
import { config as loadDotEnv } from 'dotenv';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { UserRole, UserStatus } from '../../common/enums';
import { User } from '../../users/user.entity';

loadDotEnv();

const run = async (): Promise<void> => {
  const phone = process.env.ADMIN_SEED_PHONE;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!phone || !password) {
    throw new Error('ADMIN_SEED_PHONE and ADMIN_SEED_PASSWORD are required');
  }
  if (!/^(?:\+?254|0)([17]\d{8})$/.test(phone)) {
    throw new Error('ADMIN_SEED_PHONE must be a valid Kenyan number');
  }
  const normalized = `+254${phone.replace(/[^0-9]/g, '').replace(/^254/, '').replace(/^0/, '')}`;

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number.parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER ?? 'nitume',
    password: process.env.DATABASE_PASSWORD ?? 'nitume_dev_password',
    database: process.env.DATABASE_NAME ?? 'nitume_dev',
    entities: [User],
    synchronize: false,
  });
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(User);
    const existing = await repo.findOne({ where: { phone: normalized } });
    const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
    const passwordHash = await bcrypt.hash(password, rounds);
    if (existing) {
      existing.role = UserRole.ADMIN;
      existing.status = UserStatus.ACTIVE;
      existing.passwordHash = existing.passwordHash ?? passwordHash;
      existing.email = process.env.ADMIN_SEED_EMAIL ?? existing.email;
      await repo.save(existing);
      process.stdout.write(`admin ${normalized} refreshed (was already present)\n`);
    } else {
      await repo.save(
        repo.create({
          phone: normalized,
          email: process.env.ADMIN_SEED_EMAIL ?? null,
          passwordHash,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        }),
      );
      process.stdout.write(`admin ${normalized} created\n`);
    }
  } finally {
    await dataSource.destroy();
  }
};

run().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
  process.exitCode = 1;
});