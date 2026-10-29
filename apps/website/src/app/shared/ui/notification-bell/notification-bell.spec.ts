// H T3 at component level and the G7-28 minimum for `nm-notification-bell`.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { declared, tokensOnly } from '../../../../testing/css';
import { NmNotificationBell } from './notification-bell.component';

@Component({
  imports: [NmNotificationBell],
  template: `<nm-notification-bell href="/app/customer/notifications" [unread]="unread()" />`,
})
class Host {
  readonly unread = signal(3);
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, link: () => root.querySelector('a.nm-bell') as HTMLAnchorElement };
}

describe('nm-notification-bell (G7-20)', () => {
  it('unread 3: red dot with a white ring and the name Notifications, 3 unread; links to the notifications route in-app', () => {
    const { link, root } = setup();
    expect(link().getAttribute('href')).toBe('/app/customer/notifications');
    expect(link().getAttribute('aria-label')).toBe('Notifications, 3 unread');
    const dot = root.querySelector('.nm-bell__dot') as HTMLElement;
    expect(dot.getAttribute('aria-hidden')).toBe('true');
    expect(declared('.nm-bell__dot', 'background-color')).toEqual(['var(--nitume-red)']);
    expect(declared('.nm-bell__dot', 'border')).toEqual(['1.5px solid var(--nitume-white)']);
    expect(declared('.nm-bell__dot', 'width')).toEqual(['7px']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    link().click();
    expect(navigate).toHaveBeenCalledWith('/app/customer/notifications');
  });

  it('unread 0: no dot, name Notifications', () => {
    const { fixture, link, root } = setup();
    fixture.componentInstance.unread.set(0);
    fixture.detectChanges();
    expect(root.querySelector('.nm-bell__dot')).toBeNull();
    expect(link().getAttribute('aria-label')).toBe('Notifications');
  });

  it('G7-28. 48×48 link, 36px white circle with a slate-line border, 18px blue notifications icon, focus ring, tokens only', () => {
    const { root } = setup();
    expect(declared('.nm-bell', 'width')).toEqual(['var(--nitume-tap)']);
    expect(declared('.nm-bell', 'height')).toEqual(['var(--nitume-tap)']);
    expect(declared('.nm-bell', 'color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-bell__circle', 'width')).toEqual(['36px']);
    expect(declared('.nm-bell__circle', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-bell__circle', 'background-color')).toEqual(['var(--nitume-white)']);
    const icon = root.querySelector('nm-icon') as HTMLElement;
    expect(icon.getAttribute('data-icon')).toBe('notifications');
    expect(icon.querySelector('svg')?.getAttribute('width')).toBe('18');
    expect(declared('.nm-bell:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    expect(tokensOnly()).toBe(true);
  });
});
