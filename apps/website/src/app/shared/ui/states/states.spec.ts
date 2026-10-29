import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared } from '../../../../testing/css';
import { NmEmptyState, NmErrorState, NmSkeletonCard, friendlyError } from './index';

describe('states (§12.7)', () => {
  it('30. empty state with and without title/action; the action emits', () => {
    @Component({
      imports: [NmEmptyState],
      template: `
        <nm-empty-state id="full" title="No tasks yet." message="Tasks you start appear here."
          actionLabel="Start a new task" (action)="started = started + 1" />
        <nm-empty-state id="bare" message="No offers right now" />
      `,
    })
    class Host {
      started = 0;
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;

    const title = q('#full .nm-state__title');
    expect(title.textContent).toBe('No tasks yet.');
    expect(title.getAttribute('role')).toBe('heading');
    expect(title.getAttribute('aria-level')).toBe('2');
    expect(getComputedStyle(title).fontSize).toBe('15.5px');
    const message = q('#full .nm-state__message');
    expect(getComputedStyle(message).color).toBe('var(--nitume-slate-600)');
    expect(getComputedStyle(message).fontSize).toBe('13px');
    expect(getComputedStyle(q('#full .nm-state')).textAlign).toBe('center');
    expect(getComputedStyle(q('#full .nm-state')).paddingTop).toBe('32px');
    const button = q('#full nm-button button');
    expect(button.classList).toContain('nm-btn--primary');
    button.click();
    expect(fixture.componentInstance.started).toBe(1);

    expect(q('#bare .nm-state__title')).toBeNull();
    expect(q('#bare nm-button')).toBeNull();
    expect(q('#bare .nm-state__message').textContent).toBe('No offers right now');
  });

  it('31. error state: default "Try again", retry emits, message in a live region', () => {
    @Component({
      imports: [NmErrorState],
      template: `<nm-error-state [message]="message()" (retry)="retries = retries + 1" />`,
    })
    class Host {
      readonly message = signal('Check your connection and try again.');
      retries = 0;
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const message = root.querySelector('.nm-state__message') as HTMLElement;
    expect(message.getAttribute('role')).toBe('alert');
    expect(message.textContent).toBe('Check your connection and try again.');
    const button = root.querySelector('nm-button button') as HTMLElement;
    expect(button.textContent?.trim()).toBe('Try again');
    expect(button.classList).toContain('nm-btn--outline');
    button.click();
    expect(fixture.componentInstance.retries).toBe(1);
  });

  it('32. friendlyError: network failure vs anything else', () => {
    const network = 'Check your connection and try again.';
    const other = 'Something went wrong. Please try again.';
    expect(friendlyError(new HttpErrorResponse({ status: 0 }))).toBe(network);
    expect(friendlyError(new TypeError('Failed to fetch'))).toBe(network);
    expect(friendlyError({ status: 0 })).toBe(network);
    expect(friendlyError(new HttpErrorResponse({ status: 500 }))).toBe(other);
    expect(friendlyError(new HttpErrorResponse({ status: 404 }))).toBe(other);
    expect(friendlyError(new Error('boom'))).toBe(other);
    expect(friendlyError(undefined)).toBe(other);
  });

  it('33. skeleton: role="status", aria-label "Loading", height input, static slate bars', () => {
    @Component({
      imports: [NmSkeletonCard],
      template: `<nm-skeleton-card id="a" /><nm-skeleton-card id="b" [height]="96" />`,
    })
    class Host {}
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const a = fixture.nativeElement.querySelector('#a .nm-skeleton') as HTMLElement;
    const b = fixture.nativeElement.querySelector('#b .nm-skeleton') as HTMLElement;
    expect(a.getAttribute('role')).toBe('status');
    expect(a.getAttribute('aria-label')).toBe('Loading');
    expect(a.style.height).toBe('72px');
    expect(b.style.height).toBe('96px');
    expect(getComputedStyle(a).backgroundColor).toBe('var(--nitume-white)');
    expect(getComputedStyle(a).borderRadius).toBe('var(--nitume-r-m)');
    expect(declared('.nm-skeleton', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    const bars = Array.from(a.querySelectorAll('.nm-skeleton__bar')) as HTMLElement[];
    expect(bars).toHaveLength(2);
    expect(bars.map((bar) => getComputedStyle(bar).width)).toEqual(['60%', '35%']);
    expect(bars.map((bar) => getComputedStyle(bar).height)).toEqual(['12px', '10px']);
    expect(getComputedStyle(bars[0]).backgroundColor).toBe('var(--nitume-slate)');
    expect(getComputedStyle(bars[0]).animationName).toBe('');
  });
});
