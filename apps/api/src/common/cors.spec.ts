import { describe, expect, it } from 'vitest';
import { corsOptionsDelegate } from './cors';

const optionsFor = (origin: string | undefined) => {
  let result: unknown;
  corsOptionsDelegate(['https://web.nitume.test'])({ headers: { origin } }, (_err, options) => {
    result = options;
  });
  return result;
};

describe('corsOptionsDelegate (WQ-8)', () => {
  it('allows credentials for a configured website origin', () => {
    expect(optionsFor('https://web.nitume.test')).toEqual({ origin: true, credentials: true });
  });

  it('never allows credentials for any other origin or none', () => {
    expect(optionsFor('https://evil.example')).toEqual({ origin: true, credentials: false });
    expect(optionsFor(undefined)).toEqual({ origin: true, credentials: false });
  });
});
