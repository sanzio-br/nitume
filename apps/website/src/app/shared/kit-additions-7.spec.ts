// NC§W9.16: the #7 kit additions (customer-v-new-category §W9a). The #5 and
// #6 spec files of the touched components stay unchanged and passing.
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CUSTOMER_MVP_CATEGORIES, categoryIcon } from './format/category';
import { NmIcon } from './ui/icon/icon.component';
import { NM_ICONS } from './ui/icon/icons';

const ICONS_7 = [
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
] as const;

describe('NC§W9.16 #7 kit additions', () => {
  describe('nm-icon entries (G7-7)', () => {
    it('NC§W9.16 icons. every #7 name resolves to a Material path and renders; no `place` or `business-center` entry', () => {
      @Component({ imports: [NmIcon], template: `@for (n of names; track n) { <nm-icon [name]="n" /> }` })
      class Host {
        readonly names = ICONS_7;
      }
      const fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      const icons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nm-icon'));
      expect(icons.map((i) => i.getAttribute('data-icon'))).toEqual([...ICONS_7]);
      for (const name of ICONS_7) {
        expect.soft(NM_ICONS[name], name).toMatch(/^M[\d.\-\s,a-zA-Z]+$/);
      }
      expect(Object.keys(NM_ICONS)).not.toContain('place');
      expect(Object.keys(NM_ICONS)).not.toContain('business-center');
    });

    it('NC§W9.16 categoryIcon. maps the five MVP categories (location reused for Go There For Me) and nothing for business', () => {
      expect(CUSTOMER_MVP_CATEGORIES.map((c) => categoryIcon(c))).toEqual([
        'shopping-bag',
        'local-shipping',
        'fact-check',
        'location',
        'hourglass',
      ]);
      expect(categoryIcon('business')).toBeNull();
      expect(categoryIcon('foo')).toBeNull();
    });
  });
});
