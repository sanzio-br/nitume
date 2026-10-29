// A.T9 and the other #8 kit additions (customer-x-awaiting-quote A§8; gap
// report G8-10 … G8-13). The #5, #6 and #7 spec files of the touched
// components stay unchanged and passing.
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NmIcon } from './ui/icon/icon.component';
import { NM_ICONS } from './ui/icon/icons';

const ICONS_8 = ['phone', 'check'] as const;

describe('#8 kit additions (A§8)', () => {
  describe('nm-icon phone and check (G8-10)', () => {
    it('A.T9 icons. phone and check resolve to Material paths and render as inline SVG', () => {
      @Component({ imports: [NmIcon], template: `@for (n of names; track n) { <nm-icon [name]="n" [size]="28" /> }` })
      class Host {
        readonly names = ICONS_8;
      }
      const fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      const icons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nm-icon'));
      expect(icons.map((i) => i.getAttribute('data-icon'))).toEqual([...ICONS_8]);
      for (const [i, name] of ICONS_8.entries()) {
        expect.soft(NM_ICONS[name], name).toMatch(/^M[\d.\-\s,a-zA-Z]+$/);
        expect.soft(icons[i].querySelector('path')?.getAttribute('d'), name).toBe(NM_ICONS[name]);
        expect.soft(icons[i].querySelector('svg')?.getAttribute('width'), name).toBe('28');
      }
    });
  });
});
