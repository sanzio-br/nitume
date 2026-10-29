import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NmIcon } from './icon.component';
import { NM_ICONS, NM_ICON_NAMES, NmIconName } from './icons';

@Component({
  imports: [NmIcon],
  template: `<nm-icon [name]="name()" [size]="size()" />`,
})
class Host {
  readonly name = signal<NmIconName>('home');
  readonly size = signal(21);
}

describe('nm-icon (#6)', () => {
  it('registry holds exactly the 14 names of auth-foundation §7.2 plus the 10 #7 names (§W9a) and the 2 #8 names (A§8)', () => {
    expect(NM_ICON_NAMES.sort()).toEqual(
      [
        'home',
        'home-filled',
        'add-circle',
        'add-circle-filled',
        'location',
        'location-filled',
        'history',
        'person',
        'person-filled',
        'work',
        'work-filled',
        'visibility',
        'visibility-filled',
        'arrow-back',
        // #7 (customer-v-new-category §W9a)
        'search',
        'notifications',
        'shopping-bag',
        'local-shipping',
        'fact-check',
        'hourglass',
        'bookmark',
        'close',
        'add',
        'remove',
        // #8 (customer-x-awaiting-quote A§8)
        'phone',
        'check',
      ].sort(),
    );
  });

  it('renders every name as inline SVG with currentColor, default size 21, hidden from assistive tech', () => {
    const fixture = TestBed.createComponent(Host);
    for (const name of NM_ICON_NAMES) {
      fixture.componentInstance.name.set(name);
      fixture.detectChanges();
      const host = fixture.nativeElement.querySelector('nm-icon') as HTMLElement;
      const svg = host.querySelector('svg') as SVGElement;
      expect.soft(host.getAttribute('aria-hidden'), name).toBe('true');
      expect.soft(svg.getAttribute('aria-hidden'), name).toBe('true');
      expect.soft(svg.getAttribute('focusable'), name).toBe('false');
      expect.soft(svg.getAttribute('fill'), name).toBe('currentColor');
      expect.soft(svg.getAttribute('width'), name).toBe('21');
      expect.soft(svg.querySelector('path')?.getAttribute('d'), name).toBe(NM_ICONS[name]);
    }
  });

  it('size input sets width and height; no hex colour in the markup; not focusable (no focus ring needed)', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.size.set(16);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('nm-icon') as HTMLElement;
    const svg = host.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('height')).toBe('16');
    expect(host.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(host.querySelector('[tabindex], a, button')).toBeNull();
  });
});
