import { describe, expect, it } from 'vitest';
import { assertRecheckTarget, describeTarget, parseRecheckArgs } from './recheck-args';

const target = { host: 'localhost', port: 5432, database: 'nitume_dev' };

describe('row 265: recheck script arguments', () => {
  it('defaults to a dry run without a database', () => {
    expect(parseRecheckArgs([])).toEqual({ apply: false, database: null });
  });

  it('reads --apply and --database=<name>', () => {
    expect(parseRecheckArgs(['--apply', '--database=nitume_dev'])).toEqual({ apply: true, database: 'nitume_dev' });
  });

  it('rejects unknown arguments, including a bare --database', () => {
    expect(() => parseRecheckArgs(['--force'])).toThrow(/Unknown argument/);
    expect(() => parseRecheckArgs(['--database', 'nitume_dev'])).toThrow(/Unknown argument/);
  });

  it('--apply without --database is refused and names the resolved database', () => {
    expect(() => assertRecheckTarget({ apply: true, database: null }, target)).toThrow(
      '--apply requires --database=nitume_dev',
    );
  });

  it('--apply with a mismatched --database is refused', () => {
    expect(() => assertRecheckTarget({ apply: true, database: 'nitume_prod' }, target)).toThrow(
      /--database=nitume_prod does not match the resolved database "nitume_dev"/,
    );
    expect(() => assertRecheckTarget({ apply: true, database: '' }, target)).toThrow(/does not match/);
  });

  it('--apply with the matching --database passes', () => {
    expect(() => assertRecheckTarget({ apply: true, database: 'nitume_dev' }, target)).not.toThrow();
  });

  it('a dry run needs no --database, but a given one must match', () => {
    expect(() => assertRecheckTarget({ apply: false, database: null }, target)).not.toThrow();
    expect(() => assertRecheckTarget({ apply: false, database: 'nitume_dev' }, target)).not.toThrow();
    expect(() => assertRecheckTarget({ apply: false, database: 'other' }, target)).toThrow(/does not match/);
  });

  it('describes the target with host, port and database', () => {
    expect(describeTarget(target)).toBe('target host=localhost port=5432 database=nitume_dev');
  });
});
