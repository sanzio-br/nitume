// Role routing (auth-foundation §6.2, §6.3, §6.5): pure helpers plus the
// runner onboarding step (port of `onboarding_routing.dart`).
import { firstValueFrom } from 'rxjs';
import { RunnerVerificationCheck, RunnerVerificationRecord } from '../api-types';
import type { AuthApi } from './auth-api';
import type { AppRole } from './auth.tokens';

export type RoleKind = AppRole | 'other';

/** Narrows a wire `role` string; admin, business or anything else → `other`. */
export function roleOf(user: { role: string } | null | undefined): RoleKind {
  const role = user?.role;
  return role === 'customer' || role === 'runner' ? role : 'other';
}

export const ROLE_HOME: Readonly<Record<AppRole, string>> = {
  customer: '/app/customer/home',
  runner: '/app/runner/jobs',
};

/** `customer` / `runner` for a `/app/<role>/…` path, else null. */
export function roleFromPath(path: string | null | undefined): AppRole | null {
  const m = /^\/app\/(customer|runner)(?:[/?#]|$)/.exec(path ?? '');
  return m ? (m[1] as AppRole) : null;
}

export function hasDisplayName(user: { displayName?: string | null } | null | undefined): boolean {
  return (user?.displayName?.trim().length ?? 0) > 0;
}

/**
 * §6.5: a same-origin path under `/app/<role>/`, not a sign-in, name or
 * offline page, with no `//`, backslash or scheme. Anything else → null.
 */
export function validReturnUrl(url: string | null | undefined, role: AppRole): string | null {
  if (!url) return null;
  if (url.includes('//') || url.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  if (/[\u0000-\u001f]/.test(url)) return null;
  const prefix = `/app/${role}/`;
  if (!url.startsWith(prefix)) return null;
  const first = url.slice(prefix.length).split(/[/?#]/)[0];
  if (!first || first === 'sign-in' || first === 'name' || first === 'offline') return null;
  return url;
}

export type Destination =
  | { readonly kind: 'refuse'; readonly reason: 'not-allowed' | 'wrong-account' }
  | { readonly kind: 'navigate'; readonly url: string }
  /** Fresh runner with a name: §6.3 decides (`returnUrl` used when `shell`). */
  | { readonly kind: 'onboarding'; readonly returnUrl: string | null };

export interface DestinationInput {
  readonly user: { role: string; displayName: string | null };
  /** The sign-in route the visitor used. */
  readonly flowRole: AppRole;
  /** OTP sign-in in this tab (not a restored session). */
  readonly fresh: boolean;
  readonly returnUrl?: string | null;
}

/** §6.2 rows 1–6 (pure). Row 2's API `role_mismatch` is handled by the caller. */
export function resolveDestination(input: DestinationInput): Destination {
  const kind = roleOf(input.user);
  // Row 1: admin, business or unknown.
  if (kind === 'other') return { kind: 'refuse', reason: 'not-allowed' };
  // Row 2: a customer number on the runner sign-in (row 127).
  if (input.flowRole === 'runner' && kind === 'customer') {
    return { kind: 'refuse', reason: 'wrong-account' };
  }
  // Row 3 (WQ-13): customer flow + runner → continue as a runner.
  const role: AppRole = kind;
  const returnUrl = validReturnUrl(input.returnUrl, role);
  // Row 4.
  if (!hasDisplayName(input.user)) {
    const query = returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
    return { kind: 'navigate', url: `/app/${role}/name${query}` };
  }
  // Row 5.
  if (role === 'runner' && input.fresh) return { kind: 'onboarding', returnUrl };
  // Row 6.
  return { kind: 'navigate', url: returnUrl ?? ROLE_HOME[role] };
}

export type OnboardingStep = 'shell' | 'id' | 'selfie' | 'pending';

type CheckStatus = 'approved' | 'pending' | 'rejected' | 'missing';

function checkStatus(
  checks: readonly RunnerVerificationCheck[] | undefined,
  type: string,
  side: 'front' | 'back' | null,
): CheckStatus | null {
  const check = checks?.find((c) => c.type === type && (side === null || c.side === side));
  return check ? (check.status as CheckStatus) : null;
}

/** `level2Missing` present: only a `missing` check needs a capture. */
function fromLevel2Missing(
  checks: readonly RunnerVerificationCheck[] | undefined,
  missing: readonly string[],
): OnboardingStep {
  if (missing.length === 0) return 'pending';
  const needsCapture = (name: string) => {
    const status =
      name === 'government_id_front'
        ? checkStatus(checks, 'government_id', 'front')
        : name === 'government_id_back'
          ? checkStatus(checks, 'government_id', 'back')
          : checkStatus(checks, 'selfie', null);
    return (status ?? 'missing') === 'missing';
  };
  if (missing.filter((c) => c !== 'selfie').some(needsCapture)) return 'id';
  if (missing.includes('selfie') && needsCapture('selfie')) return 'selfie';
  return 'pending';
}

function time(r: RunnerVerificationRecord): number {
  const t = r.createdAt ? Date.parse(r.createdAt) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Row 268 (R-19): each ID side takes its newest labelled record; a side
 * without one is filled, as approved, by an approved unlabelled record
 * (each such record fills one side).
 */
export function idSideStatuses(
  records: readonly RunnerVerificationRecord[],
): Record<'front' | 'back', CheckStatus> {
  const ids = records.filter((r) => r.verificationType === 'government_id');
  let spare = ids.filter((r) => !r.side && r.status === 'approved').length;
  const out = {} as Record<'front' | 'back', CheckStatus>;
  for (const side of ['front', 'back'] as const) {
    const labelled = ids
      .filter((r) => r.side === side)
      .sort((a, b) => time(b) - time(a))[0];
    if (labelled) out[side] = labelled.status as CheckStatus;
    else if (spare > 0) {
      spare -= 1;
      out[side] = 'approved';
    } else out[side] = 'missing';
  }
  return out;
}

function fromRecords(
  records: readonly RunnerVerificationRecord[],
  checks: readonly RunnerVerificationCheck[] | undefined,
): OnboardingStep {
  const local = idSideStatuses(records);
  const side = (s: 'front' | 'back') => checkStatus(checks, 'government_id', s) ?? local[s];
  if (side('front') === 'missing' || side('back') === 'missing') return 'id';
  if (!records.some((r) => r.verificationType === 'selfie')) return 'selfie';
  return 'pending';
}

/** §6.3. Never throws: any failure → `shell`. */
export async function runnerOnboardingStep(api: AuthApi): Promise<OnboardingStep> {
  try {
    const me = await firstValueFrom(api.runnerMe());
    const v = me.verification;
    if (v.verified) return 'shell';
    if (Array.isArray(v.level2Missing)) return fromLevel2Missing(v.checks, v.level2Missing);
    const records = await firstValueFrom(api.runnerVerifications());
    return fromRecords(Array.isArray(records) ? records : [], v.checks);
  } catch {
    return 'shell';
  }
}

const ONBOARDING_URL: Readonly<Record<Exclude<OnboardingStep, 'shell'>, string>> = {
  id: '/app/runner/onboarding/id',
  selfie: '/app/runner/onboarding/selfie',
  pending: '/app/runner/onboarding/pending',
};

/** The URL of a `navigate` or `onboarding` destination. */
export async function destinationUrl(
  destination: Exclude<Destination, { kind: 'refuse' }>,
  api: AuthApi,
): Promise<string> {
  if (destination.kind === 'navigate') return destination.url;
  const step = await runnerOnboardingStep(api);
  if (step === 'shell') return destination.returnUrl ?? ROLE_HOME.runner;
  return ONBOARDING_URL[step];
}
