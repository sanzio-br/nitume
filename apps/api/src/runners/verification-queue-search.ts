import { createHash } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { VerificationLevel } from '../common/enums';

/**
 * Row 278 (AV-2): the admin verification queue search box. One `q` matches,
 * case-insensitively, any of:
 *  - the display name (contains);
 *  - the sign-in phone by digits (contains), with `07…`, `7…`, `2547…` and
 *    `+2547…` normalised to the stored `+2547…` form (leading `0` / `254`
 *    dropped), when `q` is only digits, spaces, `+`, `-` and brackets;
 *  - the short id `#NT-XXXXX` (`#`, `NT-` / `NT` optional): the client's
 *    `shortId` rule, the last 5 alphanumerics of the runner profile id
 *    (hex, so only 1-5 hex characters can match; contains).
 * The values are only ever bound as SQL parameters (never interpolated);
 * LIKE wildcards in the name are escaped (`common/like.ts`).
 */
export const QUEUE_SEARCH_MIN = 2;
export const QUEUE_SEARCH_MAX = 64;

export interface QueueSearch {
  /** Trimmed, lower-cased `q` (also part of the cursor fingerprint). */
  text: string;
  /** Digits to find in the stored phone, or null when `q` is not a phone. */
  phoneDigits: string | null;
  /** Lower-case hex to find in the last 5 characters of the profile id, or null. */
  shortId: string | null;
}

const PHONE_INPUT = /^[\d\s+()-]+$/;
const SHORT_ID_INPUT = /^#?(?:nt-?)?([0-9a-f]{1,5})$/i;

/** `q` -> the three search terms; 400 search_query_invalid unless 2-64 characters after trimming. */
export const queueSearchOf = (q: string | null | undefined): QueueSearch | null => {
  if (q === undefined || q === null) {
    return null;
  }
  const text = q.trim().toLowerCase();
  if (text.length < QUEUE_SEARCH_MIN || text.length > QUEUE_SEARCH_MAX) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'search_query_invalid',
      `Search with ${QUEUE_SEARCH_MIN} to ${QUEUE_SEARCH_MAX} characters`,
      { minLength: QUEUE_SEARCH_MIN, maxLength: QUEUE_SEARCH_MAX },
    );
  }
  return { text, phoneDigits: phoneDigitsOf(text), shortId: SHORT_ID_INPUT.exec(text)?.[1]?.toLowerCase() ?? null };
};

const phoneDigitsOf = (text: string): string | null => {
  if (!PHONE_INPUT.test(text)) {
    return null;
  }
  const digits = text.replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('254') && local.length > 3) {
    local = local.slice(3);
  } else if (local.startsWith('0') && local.length > 1) {
    local = local.slice(1);
  }
  return local.length > 0 ? local : digits.length > 0 ? digits : null;
};

/** 400 level_invalid unless one of the four level values. */
export const queueLevelOf = (level: string | null | undefined): VerificationLevel | null => {
  if (level === undefined || level === null) {
    return null;
  }
  const values = Object.values(VerificationLevel) as string[];
  if (!values.includes(level)) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'level_invalid', 'Unknown level', { allowed: values });
  }
  return level as VerificationLevel;
};

/**
 * The cursor is bound to the whole filter set (status, area, level, search):
 * a short hash of it travels in the cursor, so a cursor from another set is
 * refused (400 cursor_invalid) without putting the search text in the URL twice.
 */
export const queueFilterFingerprint = (f: {
  status: string;
  serviceAreaId: string | null;
  level: string | null;
  search: string | null;
}): string =>
  createHash('sha256')
    .update(JSON.stringify([f.status, f.serviceAreaId, f.level, f.search]))
    .digest('base64url')
    .slice(0, 16);
