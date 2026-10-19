import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PaymentTypeCode } from '../src/common/enums';
import { PaymentsService } from '../src/payments/payments.service';

/**
 * Row 223: several API instances starting on an empty payment_type table
 * must not collide on IDX_payment_type_code. On the test database only:
 * removes the runner_advance reference row when nothing references it, runs
 * the seed several times while another transaction inserts the same code,
 * and checks none fails and exactly one row remains.
 */
describe('payment_type seed race (e2e, row 223)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('seeds racing an instance that inserts the same code never fail, and one row remains', async () => {
    const ds = app.get(DataSource);
    const code = PaymentTypeCode.RUNNER_ADVANCE;
    const used: { n: string }[] = await ds.query(
      `SELECT COUNT(*) AS n FROM "payment_transactions" t JOIN "payment_type" p ON p.id = t."paymentTypeId" WHERE p.code = $1`,
      [code],
    );
    expect(Number(used[0].n)).toBe(0);
    await ds.query(`DELETE FROM "payment_type" WHERE code = $1`, [code]);

    // "Another instance" inserts the code and has not committed yet: the
    // seeds below read the table without it, then their insert waits on the
    // unique index until this commits. Deterministic, no timing guess.
    const other = ds.createQueryRunner();
    await other.connect();
    await other.startTransaction();
    try {
      await other.query(`INSERT INTO "payment_type" (code, name) VALUES ($1, 'Runner advance')`, [code]);
      const seed = app.get(PaymentsService);
      const running = Promise.allSettled(Array.from({ length: 4 }, () => seed.onApplicationBootstrap()));
      for (let i = 0; i < 100; i += 1) {
        const waiting: { n: string }[] = await ds.query(
          `SELECT COUNT(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE '%payment_type%'`,
        );
        if (Number(waiting[0].n) >= 4) {
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      await other.commitTransaction();
      const results = await running;
      expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
    } finally {
      if (other.isTransactionActive) {
        await other.rollbackTransaction();
      }
      await other.release();
    }
    const rows: { n: string }[] = await ds.query(`SELECT COUNT(*) AS n FROM "payment_type" WHERE code = $1`, [code]);
    expect(Number(rows[0].n)).toBe(1);
  });
});
