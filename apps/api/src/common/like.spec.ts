import { describe, expect, it } from 'vitest';
import { escapeLike } from './like';

describe('escapeLike', () => {
  it('escapes the LIKE wildcards and the escape character', () => {
    expect(escapeLike('5%_\\a')).toBe('5\\%\\_\\\\a');
    expect(escapeLike('Mary')).toBe('Mary');
  });
});
