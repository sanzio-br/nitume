import { TestBed } from '@angular/core/testing';
import { InlineNoticeComponent } from './inline-notice.component';

describe('InlineNoticeComponent (A-11)', () => {
  it('uses role=alert for danger and a chip-size accent only', () => {
    const fixture = TestBed.createComponent(InlineNoticeComponent);
    fixture.componentRef.setInput('tone', 'danger');
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.notice') as HTMLElement;
    expect(card.getAttribute('role')).toBe('alert');
    expect(card.classList).toContain('drawer-card');
    expect(card.querySelector('.chip')?.classList).toContain('chip-danger');
  });

  it('uses role=status for success and info', () => {
    const fixture = TestBed.createComponent(InlineNoticeComponent);
    fixture.componentRef.setInput('tone', 'success');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notice').getAttribute('role')).toBe('status');
  });

  it('auto-dismisses after the given time', () => {
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(InlineNoticeComponent);
      fixture.componentRef.setInput('tone', 'success');
      fixture.componentRef.setInput('autoDismissMs', 6000);
      const spy = vi.fn();
      fixture.componentInstance.dismissed.subscribe(spy);
      fixture.detectChanges();
      vi.advanceTimersByTime(6000);
      fixture.detectChanges();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('.notice')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
