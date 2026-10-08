import { splitNumeric } from './num-text.component';

const nums = (t: string) =>
  splitNumeric(t)
    .filter((p) => p.num)
    .map((p) => p.text);

describe('splitNumeric', () => {
  it('marks amounts, date/times, ids and receipts', () => {
    expect(nums('Refund of KSh 1,200.50 approved.')).toEqual(['KSh 1,200.50']);
    expect(nums('New quote issued: KSh 1,450, valid until Today, 4:30 PM.')).toEqual([
      'KSh 1,450',
      'Today, 4:30 PM',
    ]);
    expect(nums('Valid until Mon 12 Oct, 9:05 AM.')).toEqual(['Mon 12 Oct, 9:05 AM']);
    expect(nums('#NT-10482 moves to Cancelled.')).toEqual(['#NT-10482']);
    expect(nums('M-Pesa receipt SLK4H7XQ2P. Done.')).toEqual(['SLK4H7XQ2P']);
  });

  it('leaves words alone', () => {
    expect(nums('Merchant details updated.')).toEqual([]);
    expect(
      splitNumeric('Hello')
        .map((p) => p.text)
        .join(''),
    ).toBe('Hello');
  });
});
