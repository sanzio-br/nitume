import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { accessibleText } from '../../../../testing/css';
import { NmOtpResendLine } from './otp-resend-line.component';

@Component({
  imports: [NmOtpResendLine],
  template: `<nm-otp-resend-line [cooldownEndsAt]="endsAt()" [sending]="sending()" (resend)="resends = resends + 1" />`,
})
class Host {
  readonly endsAt = signal(Date.now() + 60000);
  readonly sending = signal(false);
  resends = 0;
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host: fixture.componentInstance,
    root,
    line: () => root.querySelector('.nm-resend__line') as HTMLElement,
    live: () => root.querySelector('[aria-live]') as HTMLElement,
    tick: async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      fixture.detectChanges();
    },
  };
}

describe('nm-otp-resend-line (#6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('counts down in Fira Code num-resend; the visual countdown is aria-hidden', async () => {
    const t = setup();
    expect(t.line().textContent?.replace(/\s+/g, ' ').trim()).toBe("Didn't get it? Resend code in 1:00");
    expect(t.line().getAttribute('aria-hidden')).toBe('true');
    const count = t.root.querySelector('.nm-resend__count') as HTMLElement;
    expect(getComputedStyle(count).fontFamily).toBe('var(--nitume-font-num)');
    expect(getComputedStyle(count).fontSize).toBe('12.5px');
    expect(getComputedStyle(count).color).toBe('var(--nitume-slate-600)');
    expect(getComputedStyle(t.line()).fontSize).toBe('12.5px');
    expect(getComputedStyle(t.line()).color).toBe('var(--nitume-slate-600)');
    await t.tick(1000);
    expect(t.line().textContent).toContain('0:59');
  });

  it('at zero shows a Resend code link (green-700, 48px hit area, focus ring); disabled while sending', async () => {
    const t = setup();
    await t.tick(60000);
    expect(accessibleText(t.line())).toBe("Didn't get it? Resend code");
    const link = t.line().querySelector('button') as HTMLButtonElement;
    expect(link.textContent?.trim()).toBe('Resend code');
    expect(link.classList.contains('nm-btn--link')).toBe(true);
    expect(link.classList.contains('nm-btn--small')).toBe(true);
    expect(getComputedStyle(link).color).toBe('var(--nitume-green-700)');
    link.click();
    expect(t.host.resends).toBe(1);
    t.host.sending.set(true);
    t.fixture.detectChanges();
    expect(link.disabled).toBe(true);
  });

  it('is clock based: a 20 s timer stall still shows the right value', async () => {
    const t = setup();
    vi.setSystemTime(Date.now() + 20000); // timers did not fire for 20 s
    await t.tick(1000);
    expect(t.line().textContent).toContain('0:39');
  });

  it('announces only at the start and at zero', async () => {
    const t = setup();
    const seen = new Set<string>([t.live().textContent ?? '']);
    for (let i = 0; i < 61; i++) {
      await t.tick(1000);
      seen.add(t.live().textContent ?? '');
    }
    expect([...seen]).toEqual(['You can resend in 60 seconds.', 'You can resend the code now.']);
    // A restart mid-second shows the new value at once (no stale second).
    await vi.advanceTimersByTimeAsync(400);
    t.host.endsAt.set(Date.now() + 30000);
    t.fixture.detectChanges();
    expect(t.live().textContent).toBe('You can resend in 30 seconds.');
    expect(t.line().textContent).toContain('0:30');
  });
});
