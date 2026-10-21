import type {
  Level2Check,
  VerificationLevel,
  VerificationQueueStatus,
  VerificationSide,
  VerificationStatus,
  VerificationSummaryCheck,
  VerificationType,
} from '../../core/api-types';
import { apiError, FORBIDDEN_COPY } from '../../core/api-error';
import type { TextPart } from '../../shared/num-text.component';
import { LEVEL_LABELS } from '../../shared/status-chip.component';
import {
  QueueCheck,
  QueueRunner,
  checkKey,
  newestPerCheck,
  pendingCheckCount,
  shortId,
  timeAgo,
} from './admin-data.service';
import { formatPhone } from './shared-format';

/**
 * Runner verification labels and rules shared by the verification table
 * (`p-runners-verification-table`) and the documents drawer
 * (`drawer-runner-verification`), row 278: one definition each, no copies.
 * The newest-record-per-check rule (A-9, row 271) lives with the store and
 * is re-exported here.
 */
export { checkKey, newestPerCheck, pendingCheckCount };
export type { QueueCheck, QueueRunner };

/** Re-review note limit (rows 171, 180): optional, ≤ 500 after trim. */
export const RE_REVIEW_NOTE_MAX = 500;
/** Reject note limit (row 262): optional, internal, ≤ 500 after trim. */
export const REVIEWER_NOTE_MAX = 500;
/** The note counter is announced from here on (spec Accessibility). */
export const NOTE_ANNOUNCE_FROM = 450;

/** Status filter (per runner, API `status`); `all` is `All statuses`. */
export const VERIFICATION_STATUS_FILTERS: { value: VerificationQueueStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

/** Level filter (row 278): `All levels` + the A-02 level chip labels. */
export const VERIFICATION_LEVEL_FILTERS: { value: VerificationLevel | ''; label: string }[] = [
  { value: '', label: 'All levels' },
  ...(Object.keys(LEVEL_LABELS) as VerificationLevel[]).map((value) => ({
    value,
    label: LEVEL_LABELS[value],
  })),
];

const TYPE_LABELS: Record<string, string> = {
  government_id: 'National ID',
  selfie: 'Selfie / liveness check',
  phone: 'Phone number',
  payment_identity: 'M-Pesa identity match',
  reference: 'Reference check',
  business: 'Business check',
};

const SIDE_LABELS: Record<VerificationSide, string> = { front: 'Front', back: 'Back' };

/** Display label of a check (`National ID · Front` from `side`); never a raw enum value. */
export function verificationTypeLabel(v: {
  verificationType: string;
  side?: VerificationSide | null;
}): string {
  const base = TYPE_LABELS[v.verificationType] ?? 'Verification check';
  const side = v.verificationType === 'government_id' && v.side ? SIDE_LABELS[v.side] : null;
  return side ? `${base} · ${side}` : base;
}

/** Only ID and selfie checks carry an image. */
export function isImageCheck(v: { verificationType: string }): boolean {
  return v.verificationType === 'government_id' || v.verificationType === 'selfie';
}

export type ImageState = 'stored' | 'deleted' | 'none' | 'hidden';

/** Image line of a check: Stored, Deleted (`purgedAt`), No image, or hidden (not an image check). */
export function imageState(v: QueueCheck): ImageState {
  if (!isImageCheck(v)) return 'hidden';
  if (v.purgedAt || v.purgedLocally) return 'deleted';
  return v.hasDocument ? 'stored' : 'none';
}

/** Re-review (row 171): only a decided ID/selfie check with a stored image. */
export function canReReview(v: QueueCheck): boolean {
  return v.status !== 'pending' && imageState(v) === 'stored';
}

export type CheckRowStatus = VerificationStatus | 'missing';

/** One check row of a runner: the newest record of that check, if any. */
export interface CheckRow {
  key: string;
  label: string;
  status: CheckRowStatus;
  record: QueueCheck | null;
  /** The auto-approved phone check: `Phone number` · `Verified` + `Verified at sign-in` only. */
  compact: boolean;
}

/** Mockup order; a legacy ID image (no side) sits after `· Back`. */
const ROW_ORDER: { type: VerificationType; side: VerificationSide | null }[] = [
  { type: 'government_id', side: 'front' },
  { type: 'government_id', side: 'back' },
  { type: 'government_id', side: null },
  { type: 'phone', side: null },
  { type: 'selfie', side: null },
  { type: 'payment_identity', side: null },
  { type: 'reference', side: null },
  { type: 'business', side: null },
];

/**
 * The check rows of a runner: the required checks from the API summary
 * (`Not submitted` when never sent) plus any other check on record, each
 * shown by its newest record (per type, per side for the ID).
 */
export function checkRows(item: QueueRunner): CheckRow[] {
  const newest = new Map(newestPerCheck(item.checks).map((c) => [checkKey(c), c]));
  const required = item.verification?.checks ?? [];
  const rows: CheckRow[] = [];
  for (const { type, side } of ROW_ORDER) {
    const record = newest.get(checkKey({ verificationType: type, side })) ?? null;
    const summary: VerificationSummaryCheck | undefined = required.find(
      (c) => c.type === type && (c.side ?? null) === side,
    );
    if (!record && !summary) continue;
    const status: CheckRowStatus = record?.status ?? summary?.status ?? 'missing';
    rows.push({
      key: `${type}:${side ?? ''}`,
      label: verificationTypeLabel({ verificationType: type, side }),
      status,
      record,
      compact: type === 'phone' && status === 'approved',
    });
  }
  return rows;
}

/** Check row status words (never colour only). */
export const CHECK_STATUS_TEXT: Record<CheckRowStatus, string> = {
  approved: 'Verified',
  pending: 'Pending review',
  rejected: 'Rejected',
  missing: 'Not submitted',
};

/** `{first by name}` and `+{n}` for more areas, or null without an area. */
function areaParts(serviceAreas: { name: string }[] | null | undefined): TextPart[] | null {
  const names = (serviceAreas ?? []).map((a) => a.name).sort((a, b) => a.localeCompare(b));
  if (names.length === 0) return null;
  const parts: TextPart[] = [{ text: names[0], num: false }];
  if (names.length > 1) {
    parts.push({ text: ' ', num: false }, { text: `+${names.length - 1}`, num: true });
  }
  return parts;
}

/**
 * Drawer sub line `Applied {relative time} · {area}` (`{first by name} +{n}`
 * for more areas). Only the relative time value and `+{n}` are numeric data
 * (Fira Code); `Applied`, `·` and the area name stay Fira Sans (W-2).
 */
export function appliedLine(
  appliedAt: string | null | undefined,
  serviceAreas: { name: string }[] | null | undefined,
): TextPart[] {
  const ago = timeAgo(appliedAt);
  const parts: TextPart[] =
    ago === '—'
      ? [{ text: 'Applied', num: false }]
      : [
          { text: 'Applied ', num: false },
          { text: ago === 'Yesterday' ? 'yesterday' : ago, num: true },
        ];
  const area = areaParts(serviceAreas);
  if (!area) return parts;
  const [first, ...more] = area;
  return [...parts, { text: ` · ${first.text}`, num: false }, ...more];
}

/** Table `Service area` cell: `{name}` / `{name} +{n}`; null → `—`. */
export function areaCell(serviceAreas: { name: string }[] | null | undefined): TextPart[] | null {
  return areaParts(serviceAreas);
}

/** Two initials from the full display name (`Mercy Wanjiru` → `MW`); `R` without a name. */
export function nameInitials(displayName: string | null | undefined): string {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'R';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

const LEVELS: Record<string, { n: string; name: string }> = {
  '1_basic': { n: '1', name: 'Basic' },
  '2_id_verified': { n: '2', name: 'ID verified' },
  '3_trusted': { n: '3', name: 'Trusted' },
  '4_professional': { n: '4', name: 'Professional' },
};

const LEVEL_2_NAMES: Record<Level2Check, string> = {
  government_id_front: 'ID front',
  government_id_back: 'ID back',
  selfie: 'selfie',
};

/**
 * Level line (proposed): the API's level, never inferred; at Level 1 the
 * API's Level 2 gaps (`level2Missing`, N-L1), never computed here. Null
 * without a level; no `needs` part when the API sends no gaps.
 */
export function levelLine(
  level: string | null | undefined,
  level2Missing: readonly Level2Check[] | null | undefined,
): TextPart[] | null {
  const l = level ? LEVELS[level] : undefined;
  if (!l) return null;
  const parts: TextPart[] = [
    { text: 'Level ', num: false },
    { text: l.n, num: true },
    { text: ` — ${l.name}`, num: false },
  ];
  if (level !== '1_basic') return parts;
  const needs = (level2Missing ?? []).map((c) => LEVEL_2_NAMES[c]).filter(Boolean);
  if (needs.length === 0) return parts;
  return [
    ...parts,
    { text: ' · Level ', num: false },
    { text: '2', num: true },
    { text: ` needs: ${needs.join(', ')}`, num: false },
  ];
}

/** The level line of a queue item (runner's `level2Missing`, else the summary's). */
export function runnerLevelLine(item: QueueRunner): TextPart[] | null {
  return levelLine(
    item.runnerProfile.verificationLevel,
    item.runnerProfile.level2Missing ?? item.verification?.level2Missing,
  );
}

/** Topbar count of runners with a pending check (whole queue). */
export function awaitingCopy(n: number): string {
  if (n === 0) return 'No applications awaiting review';
  return n === 1 ? '1 application awaiting review' : `${n} applications awaiting review`;
}

/** Short name (`Mercy W.`, never shortened here); the short id without a name. */
export function runnerLabel(item: Pick<QueueRunner, 'runnerProfile' | 'user'>): string {
  return item.user?.shortName || shortId(item.runnerProfile.id);
}

/** `{short id} · {phone}`; the phone only when the name line already shows the id. */
export function idPhoneLine(item: Pick<QueueRunner, 'runnerProfile' | 'user'>): string | null {
  const phone = item.user?.phone ? formatPhone(item.user.phone) : null;
  if (!item.user?.shortName) return phone;
  const id = shortId(item.runnerProfile.id);
  return phone ? `${id} · ${phone}` : id;
}

/**
 * Runner status for the table chip (row 264 precedence): the API's
 * `applicationStatus` (AV-5) when sent, else pending if any newest record is
 * pending, else rejected if any is rejected, else approved.
 */
export function applicationStatus(item: QueueRunner): VerificationStatus {
  if (item.applicationStatus) return item.applicationStatus;
  const newest = newestPerCheck(item.checks);
  if (newest.some((c) => c.status === 'pending')) return 'pending';
  if (newest.some((c) => c.status === 'rejected')) return 'rejected';
  return 'approved';
}

/**
 * Table `Checks` cell over the newest record per (type, side) plus the
 * required checks never submitted: `{p} pending · {r} rejected · {m} not
 * submitted`, each part only when > 0; `All verified` when none. Counts are
 * numeric data (Fira Code), the words Fira Sans.
 */
export function checksSummary(item: QueueRunner): TextPart[] {
  const newest = newestPerCheck(item.checks);
  const counts: [number, string][] = [
    [newest.filter((c) => c.status === 'pending').length, 'pending'],
    [newest.filter((c) => c.status === 'rejected').length, 'rejected'],
    [
      (item.verification?.checks ?? []).filter((c) => c.status === 'missing').length,
      'not submitted',
    ],
  ];
  const parts: TextPart[] = [];
  for (const [n, word] of counts) {
    if (n === 0) continue;
    if (parts.length) parts.push({ text: ' · ', num: false });
    parts.push({ text: String(n), num: true }, { text: ` ${word}`, num: false });
  }
  return parts.length ? parts : [{ text: 'All verified', num: false }];
}

/** Reviewer name, else the short id of the admin; `—` with neither. */
export function reviewerLabel(
  reviewer: { id: string; displayName: string | null } | null,
  fallbackId: string | null,
): string {
  if (reviewer?.displayName) return reviewer.displayName;
  const id = reviewer?.id ?? fallbackId;
  return id ? shortId(id) : '—';
}

/** 403 → the access copy; anything else → the fallback. */
export function failureCopy(e: unknown, fallback: string): string {
  return apiError(e).status === 403 ? FORBIDDEN_COPY : fallback;
}

/** `purgedAt` of a 410 `verification_document_purged`, from the API only. */
export function purgedAtOf(extra: Record<string, unknown>): string | null {
  return typeof extra['purgedAt'] === 'string' ? extra['purgedAt'] : null;
}
