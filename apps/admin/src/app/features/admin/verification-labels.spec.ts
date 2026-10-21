import {
  VERIFICATION_LEVEL_FILTERS,
  VERIFICATION_STATUS_FILTERS,
  appliedLine,
  applicationStatus,
  areaCell,
  awaitingCopy,
  checkRows,
  checksSummary,
  levelLine,
  nameInitials,
  newestPerCheck,
  pendingCheckCount,
  verificationTypeLabel,
} from './verification-labels';
import { timeAgo } from './admin-data.service';
import { check, ownersChecks, runner } from '../../testing/verification-fixtures';

describe('verification labels, rows and copy', () => {
  it('labels every API type, with Front / Back from side', () => {
    expect(verificationTypeLabel({ verificationType: 'government_id', side: 'front' })).toBe(
      'National ID · Front',
    );
    expect(verificationTypeLabel({ verificationType: 'government_id', side: 'back' })).toBe(
      'National ID · Back',
    );
    expect(verificationTypeLabel({ verificationType: 'government_id', side: null })).toBe(
      'National ID',
    );
    expect(verificationTypeLabel({ verificationType: 'selfie' })).toBe('Selfie / liveness check');
    expect(verificationTypeLabel({ verificationType: 'phone' })).toBe('Phone number');
    expect(verificationTypeLabel({ verificationType: 'payment_identity' })).toBe(
      'M-Pesa identity match',
    );
    expect(verificationTypeLabel({ verificationType: 'reference' })).toBe('Reference check');
    expect(verificationTypeLabel({ verificationType: 'business' })).toBe('Business check');
  });

  it('offers All statuses and the API status values, and the four levels', () => {
    expect(VERIFICATION_STATUS_FILTERS.map((f) => f.value)).toEqual([
      'all',
      'pending',
      'approved',
      'rejected',
    ]);
    expect(VERIFICATION_STATUS_FILTERS[0].label).toBe('All statuses');
    expect(VERIFICATION_LEVEL_FILTERS.map((f) => f.value)).toEqual([
      '',
      '1_basic',
      '2_id_verified',
      '3_trusted',
      '4_professional',
    ]);
  });

  it('timeAgo never reads NaN', () => {
    expect(timeAgo(undefined)).toBe('—');
    expect(timeAgo('not a date')).toBe('—');
  });

  it('takes initials from the display name, never an id', () => {
    expect(nameInitials('Mercy Wanjiru')).toBe('MW');
    expect(nameInitials('  mercy  akinyi wanjiru ')).toBe('MW');
    expect(nameInitials('Mercy')).toBe('M');
    expect(nameInitials(null)).toBe('R');
    expect(nameInitials('   ')).toBe('R');
  });

  it('splits the Applied line: only the relative time and +{n} are numeric (W-2)', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    expect(appliedLine(yesterday, [{ name: 'Westlands' }, { name: 'Kilimani' }])).toEqual([
      { text: 'Applied ', num: false },
      { text: 'yesterday', num: true },
      { text: ' · Kilimani', num: false },
      { text: ' ', num: false },
      { text: '+1', num: true },
    ]);
    expect(appliedLine(null, [{ name: 'Kilimani' }])).toEqual([
      { text: 'Applied', num: false },
      { text: ' · Kilimani', num: false },
    ]);
  });

  it('writes the area cell as the first area by name and +{n}', () => {
    expect(areaCell([{ name: 'Westlands' }, { name: 'Kilimani' }, { name: 'Karen' }])).toEqual([
      { text: 'Karen', num: false },
      { text: ' ', num: false },
      { text: '+2', num: true },
    ]);
    expect(areaCell([{ name: 'Kilimani' }])).toEqual([{ text: 'Kilimani', num: false }]);
    expect(areaCell([])).toBeNull();
  });

  it('picks the newest record per (type, side) and counts pending on it only (W-1)', () => {
    const checks = [
      check('old', { side: 'front', createdAt: '2026-10-18T07:00:00Z' }),
      check('new', { side: 'front', status: 'approved', createdAt: '2026-10-21T07:00:00Z' }),
      check('back', { side: 'back', status: 'approved' }),
    ];
    expect(newestPerCheck(checks).map((c) => c.id)).toEqual(['new', 'back']);
    expect(pendingCheckCount(checks)).toBe(0);
    expect(pendingCheckCount([...checks, check('selfie', { verificationType: 'selfie' })])).toBe(1);
  });

  it('summarises the checks with Fira Code counts, and All verified with none open', () => {
    const owner = runner(ownersChecks());
    expect(checksSummary(owner)).toEqual([
      { text: '4', num: true },
      { text: ' pending', num: false },
    ]);
    const mixed = runner([
      check('f', { side: 'front', status: 'rejected' }),
      check('b', { side: 'back' }),
    ]);
    expect(
      checksSummary(mixed)
        .map((p) => p.text)
        .join(''),
    ).toBe('1 pending · 1 rejected · 3 not submitted');
    const done = runner(ownersChecks().map((c) => ({ ...c, status: 'approved' as const })));
    expect(checksSummary(done)).toEqual([{ text: 'All verified', num: false }]);
  });

  it('derives the runner status pending > rejected > approved, preferring the API', () => {
    const rejected = runner([check('f', { side: 'front', status: 'rejected' })]);
    expect(applicationStatus(rejected)).toBe('rejected');
    expect(
      applicationStatus(runner([...rejected.checks, check('s', { verificationType: 'selfie' })])),
    ).toBe('pending');
    expect(applicationStatus(runner([check('f', { side: 'front', status: 'approved' })]))).toBe(
      'approved',
    );
    expect(applicationStatus({ ...rejected, applicationStatus: 'approved' })).toBe('approved');
    expect(applicationStatus({ ...rejected, applicationStatus: null })).toBe('rejected');
  });

  it('counts applications, not checks', () => {
    expect(awaitingCopy(0)).toBe('No applications awaiting review');
    expect(awaitingCopy(1)).toBe('1 application awaiting review');
    expect(awaitingCopy(14)).toBe('14 applications awaiting review');
  });

  it('builds the rows in mockup order from the newest record of each check', () => {
    const rows = checkRows(
      runner([
        check('v-front-new', { side: 'front', createdAt: '2026-10-21T07:00:00Z' }),
        ...ownersChecks().map((c) =>
          c.id === 'v-front' ? { ...c, status: 'rejected' as const } : c,
        ),
        check('v-legacy', { side: null, status: 'rejected', createdAt: '2026-09-01T07:00:00Z' }),
      ]),
    );
    expect(rows.map((r) => r.label)).toEqual([
      'National ID · Front',
      'National ID · Back',
      'National ID',
      'Phone number',
      'Selfie / liveness check',
      'M-Pesa identity match',
    ]);
    expect(rows[0].record?.id).toBe('v-front-new');
    expect(rows[0].status).toBe('pending');
    expect(rows.find((r) => r.label === 'Phone number')?.compact).toBe(true);
  });

  it('shows a required check with no record as Not submitted', () => {
    const rows = checkRows(runner([check('v-front', { side: 'front' })]));
    expect(rows.find((r) => r.label === 'National ID · Back')).toMatchObject({
      status: 'missing',
      record: null,
    });
  });

  it('writes the level line from the API level and the API Level 2 gaps only', () => {
    const text = (parts: ReturnType<typeof levelLine>) => parts?.map((p) => p.text).join('');
    const all = ['government_id_front', 'government_id_back', 'selfie'] as const;
    expect(text(levelLine('1_basic', all))).toBe(
      'Level 1 — Basic · Level 2 needs: ID front, ID back, selfie',
    );
    expect(
      levelLine('1_basic', all)
        ?.filter((p) => p.num)
        .map((p) => p.text),
    ).toEqual(['1', '2']);
    expect(text(levelLine('1_basic', ['government_id_back']))).toBe(
      'Level 1 — Basic · Level 2 needs: ID back',
    );
    // No gaps (or none sent) while the API still says Level 1: the level only, never inferred.
    expect(text(levelLine('1_basic', []))).toBe('Level 1 — Basic');
    expect(text(levelLine('1_basic', undefined))).toBe('Level 1 — Basic');
    expect(text(levelLine('2_id_verified', all))).toBe('Level 2 — ID verified');
    expect(levelLine(undefined, all)).toBeNull();
  });
});
