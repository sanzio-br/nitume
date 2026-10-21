import { API } from './admin-test-utils';
import type {
  AdminRunnerRef,
  RunnerVerification,
  VerificationQueueItem,
  VerificationQueueResult,
} from '../core/api-types';

/** Fixtures shared by the verification table and documents drawer specs (row 278). */
export const PROFILE = 'aad1988f-1111-2222-3333-75662a9c0ca7';
export const USER = 'bbbbbbbb-1111-2222-3333-000000000001';
export const ADMIN = 'adadadad-1111-2222-3333-0000000a0001';
export const PROFILE_2 = 'ccccdddd-1111-2222-3333-00000000beef';

export const RUNNER: AdminRunnerRef = {
  id: PROFILE,
  userId: USER,
  verificationLevel: '1_basic',
  serviceAreas: [
    { id: 'a2', name: 'Westlands' },
    { id: 'a1', name: 'Kilimani' },
  ],
  appliedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  level2Missing: ['government_id_front', 'government_id_back', 'selfie'],
};

export const USER_ROW = {
  id: USER,
  phone: '+254712345678',
  displayName: 'Mercy Wanjiru',
  shortName: 'Mercy W.',
};

export function check(id: string, patch: Partial<RunnerVerification> = {}): RunnerVerification {
  return {
    id,
    runnerProfileId: PROFILE,
    verificationType: 'government_id',
    side: null,
    status: 'pending',
    reviewerNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-10-20T07:30:00Z',
    purgedAt: null,
    hasDocument: true,
    runnerProfile: RUNNER,
    user: USER_ROW,
    reviewer: null,
    reReviews: [],
    ...patch,
  };
}

/** The API summary: the five required checks, newest record each, `missing` when none. */
export function summaryOf(checks: RunnerVerification[]): VerificationQueueItem['verification'] {
  const req = [
    { type: 'phone', side: null },
    { type: 'government_id', side: 'front' },
    { type: 'government_id', side: 'back' },
    { type: 'selfie', side: null },
    { type: 'payment_identity', side: null },
  ] as const;
  const rows = req.map(({ type, side }) => ({
    type,
    side,
    status:
      checks.find((c) => c.verificationType === type && (side === null || c.side === side))
        ?.status ?? ('missing' as const),
  }));
  return { verified: rows.every((r) => r.status === 'approved'), checks: rows };
}

export function runner(
  checks: RunnerVerification[],
  patch: Partial<VerificationQueueItem> = {},
): VerificationQueueItem {
  const pending = checks.filter((c) => c.status === 'pending');
  const runnerProfile = patch.runnerProfile ?? RUNNER;
  return {
    runnerProfile: RUNNER,
    user: USER_ROW,
    checks,
    pendingCount: pending.length,
    oldestPendingAt: pending.length ? pending[pending.length - 1].createdAt : null,
    // The API sends the same Level 2 gaps on the summary and on the runner.
    verification: { ...summaryOf(checks), level2Missing: runnerProfile.level2Missing },
    ...patch,
  };
}

/** The owner's runner (local DB, 2026-10-21): ID front, back, selfie, payment pending + auto-approved phone. */
export function ownersChecks(): RunnerVerification[] {
  return [
    check('v-pay', { verificationType: 'payment_identity', hasDocument: false }),
    check('v-selfie', { verificationType: 'selfie' }),
    check('v-back', { side: 'back' }),
    check('v-front', { side: 'front' }),
    check('v-phone', {
      verificationType: 'phone',
      status: 'approved',
      hasDocument: false,
      createdAt: '2026-10-19T07:00:00Z',
    }),
  ];
}

export function page(
  items: VerificationQueueItem[],
  patch: Partial<VerificationQueueResult> = {},
): VerificationQueueResult {
  return {
    items,
    nextCursor: null,
    total: items.length,
    awaitingReviewCount: items.filter((i) => i.checks.some((c) => c.status === 'pending')).length,
    ...patch,
  };
}

export const isQueue = (r: { url: string }) => r.url === `${API}/runners/verifications/queue`;
export const isDocument = (r: { url: string }) =>
  r.url.startsWith(`${API}/runners/verifications/`) && r.url.endsWith('/document');
export const documentUrl = (id: string) => `${API}/runners/verifications/${id}/document`;
export const runnerUrl = (id: string = PROFILE) => `${API}/runners/${id}/verifications`;
export const AREAS_URL = `${API}/runners/service-areas`;
