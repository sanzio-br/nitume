import 'reflect-metadata';
import { join } from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { ENTITY_LIST } from './entities';

loadDotEnv();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number.parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  username: process.env.DATABASE_USER ?? 'nitume',
  password: process.env.DATABASE_PASSWORD ?? 'nitume_dev_password',
  database: process.env.DATABASE_NAME ?? 'nitume_dev',
  entities: ENTITY_LIST,
  migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
  synchronize: false,
  logging: false,
});