import { normalizeKenyanPhone } from './formatters';

describe('normalizeKenyanPhone (auth-foundation §7.1)', () => {
  it('F9.47. accepts the Kenyan formats (spaces and hyphens stripped) and rejects the rest', () => {
    for (const input of [
      '0712345678',
      '254712345678',
      '+254712345678',
      '+254 712 345 678',
      '0712-345-678',
      '  0712345678  ',
    ]) {
      expect.soft(normalizeKenyanPhone(input), input).toBe('+254712345678');
    }
    expect(normalizeKenyanPhone('0112345678')).toBe('+254112345678');
    for (const input of ['712345678', '0812345678', '+25471234567', '', 'abc']) {
      expect.soft(normalizeKenyanPhone(input), input).toBeNull();
    }
  });
});
