/**
 * Row 265 (reviewer follow-up): argument parsing and the `--apply` target
 * guard for `recheck-id-verified-levels.ts`, kept free of I/O so they are
 * unit-tested. The resolved target comes from `AppDataSource.options`, which
 * reads DATABASE_* the same way the app config does (`.env`, then the
 * `localhost` / `nitume_dev` defaults).
 */

export interface RecheckArgs {
  apply: boolean;
  /** Value of `--database=<name>`, or null when not given. */
  database: string | null;
}

export interface RecheckTarget {
  host: string;
  port: number;
  database: string;
}

const DATABASE_FLAG = '--database=';

export const parseRecheckArgs = (args: readonly string[]): RecheckArgs => {
  let apply = false;
  let database: string | null = null;
  const unknown: string[] = [];
  for (const arg of args) {
    if (arg === '--apply') {
      apply = true;
    } else if (arg.startsWith(DATABASE_FLAG)) {
      database = arg.slice(DATABASE_FLAG.length);
    } else {
      unknown.push(arg);
    }
  }
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(' ')}. Only --apply and --database=<name> are accepted.`);
  }
  return { apply, database };
};

/**
 * `--apply` must name the database it writes to. Throws (the script exits 1)
 * before anything connects for writes when `--database=<name>` is missing or
 * differs from the resolved name. Without `--apply`, a given `--database`
 * must still match, so a dry run never reports on a different database than
 * the one the caller meant.
 */
export const assertRecheckTarget = (args: RecheckArgs, target: RecheckTarget): void => {
  if (args.apply && args.database === null) {
    throw new Error(
      `--apply requires --database=${target.database} (the resolved database on ${target.host}:${target.port}).`,
    );
  }
  if (args.database !== null && args.database !== target.database) {
    throw new Error(
      `--database=${args.database} does not match the resolved database "${target.database}" on ${target.host}:${target.port}. Nothing was changed.`,
    );
  }
};

export const describeTarget = (target: RecheckTarget): string =>
  `target host=${target.host} port=${target.port} database=${target.database}`;
