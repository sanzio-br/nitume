// NC§W9.16: the #7 kit additions (customer-v-new-category §W9a). The #5 and
// #6 spec files of the touched components stay unchanged and passing.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { declared } from '../../testing/css';
import { NmBackButton, NmBackEvent } from './ui/back-button/back-button.component';
import { NmPushedHeader } from './ui/pushed-header/pushed-header.component';
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

  describe('nm-back-button disabled, nm-pushed-header backDisabled (G7-8)', () => {
    @Component({
      imports: [NmBackButton, NmPushedHeader],
      template: `
        <nm-back-button class="solo" fallback="/app/customer/home" [disabled]="off()" (back)="backs.push($event)" />
        <nm-pushed-header class="hdr" title="Review" fallback="/app/customer/home" [backDisabled]="off()" (back)="backs.push($event)" />
      `,
    })
    class Host {
      readonly off = signal(true);
      readonly backs: NmBackEvent[] = [];
    }

    function setup() {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      return { fixture, root: fixture.nativeElement as HTMLElement, navigate };
    }

    it('NC§W9.16 back-button. disabled renders the disabled attribute and aria-disabled, emits nothing and does not navigate; slate-400 arrow', () => {
      const { fixture, root, navigate } = setup();
      for (const sel of ['.solo button', '.hdr button']) {
        const button = root.querySelector(sel) as HTMLButtonElement;
        expect(button.disabled, sel).toBe(true);
        expect(button.getAttribute('aria-disabled'), sel).toBe('true');
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
      expect(fixture.componentInstance.backs).toEqual([]);
      expect(navigate).not.toHaveBeenCalled();
      expect(declared('.nm-back:disabled', 'color')).toEqual(['var(--nitume-slate-400)']);
    });

    it('NC§W9.16 back-button default. enabled by default: no disabled or aria-disabled attribute, and the click emits and navigates', () => {
      const { fixture, root, navigate } = setup();
      fixture.componentInstance.off.set(false);
      fixture.detectChanges();
      const button = root.querySelector('.hdr button') as HTMLButtonElement;
      expect(button.hasAttribute('disabled')).toBe(false);
      expect(button.hasAttribute('aria-disabled')).toBe(false);
      button.click();
      expect(fixture.componentInstance.backs).toHaveLength(1);
      expect(navigate).toHaveBeenCalledWith('/app/customer/home');
    });
  });
});
