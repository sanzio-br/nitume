// NC§W9.16: the #7 kit additions (customer-v-new-category §W9a). The #5 and
// #6 spec files of the touched components stay unchanged and passing.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { declared } from '../../testing/css';
import { NmBackButton, NmBackEvent } from './ui/back-button/back-button.component';
import { NmPushedHeader } from './ui/pushed-header/pushed-header.component';
import { NmField } from './ui/field/field.component';
import { NmFieldValue } from './ui/field/field-value.directive';
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

  describe('nm-field place-field inputs and nmFieldValue updates (G7-9)', () => {
    @Component({
      imports: [NmField, NmFieldValue],
      template: `
        <nm-field class="plain" label="Plain" />
        <nm-field
          class="place"
          label="Pick up from"
          leadingIcon="location"
          [busy]="busy()"
          [role]="'combobox'"
          [ariaAutocomplete]="'list'"
          [ariaExpanded]="expanded()"
          [ariaControls]="'list-1'"
          [ariaActivedescendant]="active()"
          [nmFieldValue]="value()"
          (nmFieldValueChange)="emitted.push($event); value.set($event)"
        />
      `,
    })
    class Host {
      readonly busy = signal(false);
      readonly expanded = signal(false);
      readonly active = signal<string | null>(null);
      readonly value = signal('');
      readonly emitted: string[] = [];
    }

    function setup() {
      const fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      return {
        fixture,
        host: fixture.componentInstance,
        plain: root.querySelector('.plain input') as HTMLInputElement,
        place: root.querySelector('.place input') as HTMLInputElement,
        root,
      };
    }

    it('NC§W9.16 field defaults. without the #7 inputs no icon, no spinner and no combobox or busy attribute', () => {
      const { plain, root } = setup();
      for (const attr of ['role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant', 'aria-busy']) {
        expect.soft(plain.hasAttribute(attr), attr).toBe(false);
      }
      expect(root.querySelector('.plain nm-icon')).toBeNull();
      expect(root.querySelector('.plain .nm-field__spinner')).toBeNull();
      expect(plain.classList.contains('nm-field__input--lead')).toBe(false);
    });

    it('NC§W9.16 field leadingIcon. an 18px slate-600 icon on the left and 40px input padding', () => {
      const { place, root } = setup();
      const icon = root.querySelector('.place nm-icon') as HTMLElement;
      expect(icon.getAttribute('data-icon')).toBe('location');
      expect(icon.querySelector('svg')?.getAttribute('width')).toBe('18');
      expect(declared('.nm-field__lead', 'color')).toEqual(['var(--nitume-slate-600)']);
      expect(place.classList.contains('nm-field__input--lead')).toBe(true);
      expect(declared('.nm-field__input--lead', 'padding-left')).toEqual(['40px']);
    });

    it('NC§W9.16 field busy. aria-hidden spinner, aria-busy on the input, no spin under reduced motion', () => {
      const { fixture, host, place, root } = setup();
      host.busy.set(true);
      fixture.detectChanges();
      const spinner = root.querySelector('.place .nm-field__spinner') as HTMLElement;
      expect(spinner.getAttribute('aria-hidden')).toBe('true');
      expect(place.getAttribute('aria-busy')).toBe('true');
      expect(declared('.nm-field__spinner', 'width')).toEqual(['16px']);
      expect(declared('.nm-field__spinner', 'animation')).toContain('none');
      host.busy.set(false);
      fixture.detectChanges();
      expect(place.hasAttribute('aria-busy')).toBe(false);
      expect(root.querySelector('.place .nm-field__spinner')).toBeNull();
    });

    it('NC§W9.16 field combobox. role, aria-autocomplete, aria-expanded, aria-controls and aria-activedescendant on the native input', () => {
      const { fixture, host, place } = setup();
      expect(place.getAttribute('role')).toBe('combobox');
      expect(place.getAttribute('aria-autocomplete')).toBe('list');
      expect(place.getAttribute('aria-expanded')).toBe('false');
      expect(place.getAttribute('aria-controls')).toBe('list-1');
      expect(place.hasAttribute('aria-activedescendant')).toBe(false);
      host.expanded.set(true);
      host.active.set('opt-2');
      fixture.detectChanges();
      expect(place.getAttribute('aria-expanded')).toBe('true');
      expect(place.getAttribute('aria-activedescendant')).toBe('opt-2');
    });

    it('NC§W9.16 nmFieldValue. writes a changed input after init and never writes back the value the control just emitted', () => {
      const { fixture, host, place } = setup();
      const write = vi.spyOn(NmField.prototype, 'writeValue');
      place.value = 'Sar';
      place.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(host.emitted).toEqual(['Sar']);
      expect(write).not.toHaveBeenCalled(); // typing round-trips without a write
      host.value.set('Sarit Centre, Westlands, Nairobi');
      fixture.detectChanges();
      expect(write).toHaveBeenCalledTimes(1);
      expect(place.value).toBe('Sarit Centre, Westlands, Nairobi');
      host.value.set('');
      fixture.detectChanges();
      expect(place.value).toBe('');
      write.mockRestore();
    });
  });
});
