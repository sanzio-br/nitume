import { describe, expect, it } from 'vitest';
import { shortNameOf } from './short-name';

describe('shortNameOf (row 40)', () => {
  it.each([
    ['Kevin Otieno', 'Kevin O.'],
    ['  Kevin   Otieno  ', 'Kevin O.'],
    ['Mary Wanjiru Kamau', 'Mary K.'],
    ['Mary-Jane O\'Neil', 'Mary-Jane O.'],
    ['amina hassan', 'amina H.'],
    ['Kevin', 'Kevin'],
    ['Kevin .', 'Kevin'],
  ])('%s -> %s', (input, expected) => {
    expect(shortNameOf(input)).toBe(expected);
  });

  it('is null without a name', () => {
    expect(shortNameOf(null)).toBeNull();
    expect(shortNameOf('   ')).toBeNull();
  });
});
