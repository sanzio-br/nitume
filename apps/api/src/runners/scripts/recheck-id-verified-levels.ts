/**
 * Row 265 (owner, 2026-10-21): one-time re-check of the runners already at
 * `2_id_verified` under the current Level 2 rule (rows 261, 263, 268), run by
 * hand at deploy. Not a migration; nothing runs it on boot.
 *
 * Usage (from apps/api, DATABASE_* from .env or the shell):
 *   npm run runners:recheck-level2            dry run: count + runner profile ids that would drop
 *   npm run runners:recheck-level2 -- --apply drops them to 1_basic (one transaction, each change logged)
 *
 * The dry run opens a READ ONLY transaction, so it cannot write, and does not
 * boot the app (no queues, no schedulers). `--apply` boots the app context
 * with queue workers off (QUEUE_WORKERS_ENABLED=false) and calls
 * `RunnersService.recheckIdVerifiedLevels({ apply: true })`: each profile is
 * re-checked under its row lock, then the runner's open offers are withdrawn
 * (row 266) and the notifications go to the queues for the running server.
 * Levels 3 and 4 are never touched; no level is raised.
 */
import 'reflect-metadata';
import { AppDataSource } from '../../databases/data-source';
import { RunnerProfile } from '../runner-profile.entity';
import { RunnerVerification } from '../runner-verification.entity';
import { RunnersService } from '../runners.service';

const print = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const report = (mode: string, database: string | undefined, ids: string[]): void => {
  print(`[${mode}] database=${database ?? '?'} runners dropping 2_id_verified -> 1_basic: ${ids.length}`);
  for (const id of ids) {
    print(`  ${id}`);
  }
};

const dryRun = async (): Promise<void> => {
  const ds = await AppDataSource.initialize();
  const runner = ds.createQueryRunner();
  try {
    await runner.startTransaction();
    await runner.query('SET TRANSACTION READ ONLY');
    // Only the two repositories the dry run reads; nothing else is used without `apply`.
    const service = new RunnersService(
      runner.manager.getRepository(RunnerProfile),
      runner.manager.getRepository(RunnerVerification),
      undefined as never,
      undefined as never,
      undefined as never,
    );
    const { runnerProfileIds } = await service.recheckIdVerifiedLevels({ apply: false });
    report('dry run', ds.options.database as string | undefined, runnerProfileIds);
    print('Nothing was changed. Re-run with --apply to drop them.');
  } finally {
    if (runner.isTransactionActive) {
      await runner.rollbackTransaction();
    }
    await runner.release();
    await ds.destroy();
  }
};

const apply = async (): Promise<void> => {
  process.env.QUEUE_WORKERS_ENABLED = 'false';
  // Imported after the env is set: the modules read it when they load.
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../../app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    const { runnerProfileIds } = await app.get(RunnersService).recheckIdVerifiedLevels({ apply: true });
    report('apply', process.env.DATABASE_NAME, runnerProfileIds);
  } finally {
    await app.close();
  }
};

// Every dropped runner is printed (one line each) by `report`.
const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== '--apply');
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(' ')}. Only --apply is accepted.`);
  }
  await (args.includes('--apply') ? apply() : dryRun());
};

main().then(
  // Queue and Redis clients can keep the event loop alive after app.close().
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  },
);
