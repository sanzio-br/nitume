import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { QuoteErrandDto } from './matching.dto';

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
