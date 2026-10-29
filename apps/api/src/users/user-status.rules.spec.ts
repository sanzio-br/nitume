import { describe, expect, it } from 'vitest';
import { ApiError } from '../common/api-error';
import { UserStatus } from '../common/enums';
import {
  ALLOWED_STATUS_TRANSITIONS,
  isAllowedStatusTransition,
  normaliseStatusReason,
  statusTransitionNotAllowed,
} from './user-status.rules';

const { ACTIVE, SUSPENDED, BANNED } = UserStatus;

const thrown = (fn: () => unknown): ApiError => {
  try {
    fn();
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('expected a throw');
};

describe('account status rules (issue #24, owner WQ-23)', () => {
  it.each([
    [ACTIVE, SUSPENDED],
    [SUSPENDED, ACTIVE],
    [ACTIVE, BANNED],
    [SUSPENDED, BANNED],
    [BANNED, ACTIVE],
  ])('allows %s -> %s', (from, to) => {
    expect(isAllowedStatusTransition(from, to)).toBe(true);
  });

  it.each([
    [BANNED, SUSPENDED],
    [ACTIVE, ACTIVE],
    [SUSPENDED, SUSPENDED],
    [BANNED, BANNED],
  ])('refuses %s -> %s', (from, to) => {
    expect(isAllowedStatusTransition(from, to)).toBe(false);
  });

  it('lists exactly the approved transitions', () => {
    expect(ALLOWED_STATUS_TRANSITIONS).toEqual({
      active: ['suspended', 'banned'],
      suspended: ['active', 'banned'],
      banned: ['active'],
    });
  });

  it('a refused transition is 409 status_transition_not_allowed with from, to and allowed', () => {
    expect(statusTransitionNotAllowed(BANNED, SUSPENDED).getResponse()).toEqual({
      statusCode: 409,
      code: 'status_transition_not_allowed',
      message: 'A banned account cannot be set to suspended',
      from: 'banned',
      to: 'suspended',
      allowed: ['active'],
    });
  });

  describe('reason', () => {
    it('is trimmed and accepted at 10 and 500 characters', () => {
      expect(normaliseStatusReason('   Fraud report  ')).toBe('Fraud report');
      expect(normaliseStatusReason('a'.repeat(10))).toHaveLength(10);
      expect(normaliseStatusReason(`  ${'a'.repeat(500)}  `)).toHaveLength(500);
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['not text', 1234567890123],
      ['9 characters', 'a'.repeat(9)],
      ['blank padded to 10', `   ${'a'.repeat(9)}   `],
      ['501 characters', 'a'.repeat(501)],
    ])('is refused when %s with 400 status_reason_invalid', (_label, raw) => {
      const err = thrown(() => normaliseStatusReason(raw));
      expect(err.getStatus()).toBe(400);
      expect(err.getResponse()).toEqual({
        statusCode: 400,
        code: 'status_reason_invalid',
        message: 'A reason of 10 to 500 characters is required',
        minLength: 10,
        maxLength: 500,
      });
    });
  });
});
