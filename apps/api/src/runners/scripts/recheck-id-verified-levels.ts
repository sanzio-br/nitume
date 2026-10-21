/**
 * Row 265 (owner, 2026-10-21): one-time re-check of the runners already at
 * `2_id_verified` under the current Level 2 rule (rows 261, 263, 268), run by
 * hand at deploy. Not a migration; nothing runs it on boot.
 *
 * Usage (from apps/api, DATABASE_* from .env or the shell; unset falls back
 * to the app defaults, e.g. localhost / nitume_dev):
 *   npm run runners:recheck-level2
 *       dry run: count + runner profile ids that would drop
 *   npm run runners:recheck-level2 -- --apply --database=<name>
 *       drops them to 1_basic (one transaction, each change logged)
 *
 * Both modes print the resolved host, port and database first. `--apply`
 * must repeat the resolved database name in `--database=<name>`; when it is
 * missing or differs, the script exits 1 before it connects for writes.
 * A dry run accepts `--database=<name>` too and then also requires a match.
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
import { assertRecheckTarget, describeTarget, parseRecheckArgs, type RecheckTarget } from './recheck-args';

const print = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const report = (mode: string, database: string, ids: string[]): void => {
  print(`[${mode}] database=${database} runners dropping 2_id_verified -> 1_basic: ${ids.length}`);
  for (const id of ids) {
    print(`  ${id}`);
  }
};

// Same resolution as the app config: .env (loaded by data-source), then the defaults.
const resolveTarget = (): RecheckTarget => {
  const options = AppDataSource.options as { host?: string; port?: number; database?: string };
  return { host: options.host ?? 'localhost', port: options.port ?? 5432, database: options.database ?? 'nitume_dev' };
};

const dryRun = async (target: RecheckTarget): Promise<void> => {
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
    report('dry run', target.database, runnerProfileIds);
    print('Nothing was changed. Re-run with --apply to drop them.');
  } finally {
    if (runner.isTransactionActive) {
      await runner.rollbackTransaction();
    }
    await runner.release();
    await ds.destroy();
  }
};

const apply = async (target: RecheckTarget): Promise<void> => {
  process.env.QUEUE_WORKERS_ENABLED = 'false';
  // Imported after the env is set: the modules read it when they load.
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../../app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    // Belt and braces: the app's own connection must be the confirmed target.
    const { DataSource } = await import('typeorm');
    const options = app.get(DataSource).options as { host?: string; database?: string };
    if (options.host !== target.host || options.database !== target.database) {
      throw new Error(
        `The app connected to ${options.host}/${options.database}, not ${target.host}/${target.database}. Nothing was changed.`,
      );
    }
    const { runnerProfileIds } = await app.get(RunnersService).recheckIdVerifiedLevels({ apply: true });
    report('apply', target.database, runnerProfileIds);
  } finally {
    await app.close();
  }
};

// Every dropped runner is printed (one line each) by `report`.
const main = async (): Promise<void> => {
  const args = parseRecheckArgs(process.argv.slice(2));
  const target = resolveTarget();
  // Printed before any connection, so the operator sees where a write would go.
  print(describeTarget(target));
  assertRecheckTarget(args, target);
  await (args.apply ? apply(target) : dryRun(target));
};

main().then(
  // Queue and Redis clients can keep the event loop alive after app.close().
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  },
);
