import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AssignmentDeclineReason } from '../../common/enums';
import { DeclineAssignmentDto, QuoteErrandDto } from './matching.dto';

const errorsFor = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(QuoteErrandDto, body))).map((e) => e.property);

describe('QuoteErrandDto.expiresAt (row 83)', () => {
  it('may be omitted (the server applies the default TTL)', async () => {
    expect(await errorsFor({ total: 500 })).toEqual([]);
  });

  it('refuses null', async () => {
    expect(await errorsFor({ total: 500, expiresAt: null })).toContain('expiresAt');
  });

  it('accepts an ISO 8601 date and refuses anything else', async () => {
    expect(await errorsFor({ total: 500, expiresAt: '2030-01-01T00:00:00Z' })).toEqual([]);
    expect(await errorsFor({ total: 500, expiresAt: 'tomorrow' })).toContain('expiresAt');
  });
});

describe('decline reasons (rows 108, 210)', () => {
  it('the legacy over-limit route takes over_purchase_limit only', async () => {
    const legacy = async (reason: unknown) =>
      (await validate(plainToInstance(DeclineAssignmentDto, { reason }))).map((e) => e.property);
    expect(await legacy('over_purchase_limit')).toEqual([]);
    for (const reason of ['too_far', 'not_available', 'other', undefined, 'busy']) {
      expect(await legacy(reason)).toContain('reason');
    }
  });

  it('the enum lists the four row-210 values in order', () => {
    expect(Object.values(AssignmentDeclineReason)).toEqual(['over_purchase_limit', 'too_far', 'not_available', 'other']);
  });
});
