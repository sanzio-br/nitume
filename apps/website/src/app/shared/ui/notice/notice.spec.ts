import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared } from '../../../../testing/css';
import { NmButton } from '../button/button.component';
import { NmNotice } from './notice.component';

describe('nm-notice (§12.8)', () => {
  it('39. info icon by default, danger swaps to the red error icon, no coloured fill, action slot renders', () => {
    @Component({
      imports: [NmNotice, NmButton],
      template: `
        <nm-notice id="n" [tone]="tone()" [icon]="icon()">
          Reconnecting…
          <nm-button nmNoticeAction variant="outline" size="small">Retry</nm-button>
        </nm-notice>
      `,
    })
    class Host {
      readonly tone = signal<'info' | 'danger'>('info');
      readonly icon = signal(true);
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const notice = () => fixture.nativeElement.querySelector('.nm-notice') as HTMLElement;
    const icon = () => notice().querySelector('.nm-notice__icon') as SVGElement | null;

    expect(getComputedStyle(notice()).backgroundColor).toBe('var(--nitume-white)');
    expect(declared('.nm-notice', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(getComputedStyle(notice()).borderRadius).toBe('var(--nitume-r-m)');
    expect(getComputedStyle(notice()).paddingTop).toBe('12px');
    const text = notice().querySelector('.nm-notice__text') as HTMLElement;
    expect(text.textContent?.trim()).toBe('Reconnecting…');
    expect(getComputedStyle(text).color).toBe('var(--nitume-slate-600)');
    expect(getComputedStyle(text).fontSize).toBe('13px');
    expect(icon()).not.toBeNull();
    expect(icon()!.getAttribute('aria-hidden')).toBe('true');
    expect(getComputedStyle(icon()!).color).toBe('var(--nitume-slate-600)');
    expect(icon()!.querySelector('path[d="M12 16v-5"]')).not.toBeNull();

    // Action slot.
    const action = notice().querySelector('.nm-notice__action nm-button button') as HTMLElement;
    expect(action.textContent?.trim()).toBe('Retry');
    expect(action.classList).toContain('nm-btn--outline');

    // Danger: red error icon; card, border and text unchanged (no fill).
    host.tone.set('danger');
    host.icon.set(false); // the danger icon is always shown
    fixture.detectChanges();
    expect(icon()).not.toBeNull();
    expect(getComputedStyle(icon()!).color).toBe('var(--nitume-red)');
    expect(icon()!.querySelector('path[d="M12 7v6"]')).not.toBeNull();
    expect(getComputedStyle(notice()).backgroundColor).toBe('var(--nitume-white)');
    expect(getComputedStyle(text).color).toBe('var(--nitume-slate-600)');

    host.tone.set('info');
    fixture.detectChanges();
    expect(icon()).toBeNull();
  });
});
