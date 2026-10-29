// G7-17 / G7-28: `nm-category-tile` and `nm-category-grid` (NC T5–T7, T10
// at component level; the page tests repeat them on the real views).
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { cssRuleValues, declared, noShadow, tokensOnly } from '../../../../testing/css';
import { NmCategoryGrid } from './category-grid.component';
import { NmCategoryMode } from './category-tile.component';

@Component({
  imports: [NmCategoryGrid],
  template: `
    <h2 id="lbl">What do you need done?</h2>
    <nm-category-grid
      [mode]="mode()"
      [selected]="selected()"
      labelledBy="lbl"
      [linkFor]="link"
      (selectedChange)="selected.set($event)"
    />
  `,
})
class Host {
  readonly mode = signal<NmCategoryMode>('select');
  readonly selected = signal<string | null>(null);
  readonly link = (c: string) => `/app/customer/new?category=${c}`;
}

function setup(mode: NmCategoryMode = 'select') {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.mode.set(mode);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const radios = () => Array.from(root.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const update = () => fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, root, radios, update };
}

const NAMES = ['Buy For Me', 'Get It For Me', 'Check It For Me', 'Go There For Me', 'Wait For Me'];

describe('nm-category-grid / nm-category-tile (G7-17)', () => {
  it('renders five tiles in canonical order with the display names, three columns, the sixth cell empty', () => {
    const { root, radios } = setup();
    expect(radios().map((r) => r.querySelector('.nm-category-tile__label')?.textContent)).toEqual(NAMES);
    const grid = root.querySelector('.nm-category-grid') as HTMLElement;
    expect(grid.children).toHaveLength(5);
    expect(declared('.nm-category-grid', 'grid-template-columns')).toEqual(['repeat(3, minmax(0, 1fr))']);
    expect(declared('.nm-category-grid', 'gap')).toEqual(['10px']);
    expect(root.textContent).not.toContain('Business Tasks');
  });

  it('select mode: radiogroup named by the label; posinset/setsize; roving tabindex; arrows move and select with wrap; Space selects', () => {
    const { host, root, radios, update } = setup();
    const group = root.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group.getAttribute('aria-labelledby')).toBe('lbl');
    expect(radios().map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1']);
    expect(radios()[2].getAttribute('aria-posinset')).toBe('3');
    expect(radios()[2].getAttribute('aria-setsize')).toBe('5');
    expect(radios().every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);

    radios()[0].focus();
    radios()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    update();
    expect(host.selected()).toBe('queue_admin'); // wraps to the last tile
    expect(document.activeElement).toBe(radios()[4]);
    radios()[4].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    update();
    expect(host.selected()).toBe('buy_for_me');
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false']);
    expect(radios().map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1']);
    // Space on a native button activates it (click).
    radios()[2].click();
    update();
    expect(host.selected()).toBe('inspection');
    expect(radios()[2].getAttribute('tabindex')).toBe('0');
  });

  it('selected tile: green border and a 2px green-050 inner ring (second border), no shadow; unselected slate-line; hover blue', () => {
    const { host, radios, update } = setup();
    host.selected.set('inspection');
    update();
    expect(radios()[2].classList.contains('nm-category-tile--selected')).toBe(true);
    expect(radios()[0].classList.contains('nm-category-tile--selected')).toBe(false);
    expect(declared('.nm-category-tile--selected', 'border-color')).toContain('var(--nitume-green)');
    expect(declared('.nm-category-tile--selected::after', 'border')).toEqual(['2px solid var(--nitume-green-050)']);
    expect(declared('.nm-category-tile', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(cssRuleValues(['.nm-category-tile', ':hover'], 'border-color')).toContain('var(--nitume-blue)');
    expect(noShadow()).toBe(true);
  });

  it('icons: blue icon in a 32px green-050 box; shopping-bag, local-shipping, fact-check, location, hourglass; icons hidden from AT', () => {
    const { radios } = setup();
    expect(radios().map((r) => r.querySelector('nm-icon')?.getAttribute('data-icon'))).toEqual([
      'shopping-bag',
      'local-shipping',
      'fact-check',
      'location',
      'hourglass',
    ]);
    expect(radios().every((r) => r.querySelector('nm-icon')?.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(declared('.nm-category-tile__icon', 'color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-category-tile__icon', 'background-color')).toEqual(['var(--nitume-green-050)']);
    expect(declared('.nm-category-tile__icon', 'width')).toEqual(['32px']);
  });

  it('G7-28. accessible name is the display name; focus ring; label row-title 11.5 with line-height 1.3; tokens only', () => {
    const { radios } = setup();
    expect(radios()[3].textContent?.trim()).toBe('Go There For Me');
    expect(declared('.nm-category-tile:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    expect(declared('.nm-category-tile__label', 'font-size')).toEqual(['11.5px']);
    expect(declared('.nm-category-tile__label', 'font-weight')).toEqual(['600']);
    expect(declared('.nm-category-tile__label', 'line-height')).toContain('1.3');
    expect(declared('.nm-category-tile', 'background-color')).toEqual(['var(--nitume-white)']);
    expect(declared('.nm-category-tile', 'border-radius')).toEqual(['var(--nitume-r-m)']);
    expect(tokensOnly()).toBe(true);
  });

  it('link mode: <a> to linkFor(wire), followed in-app, never selected, no radiogroup', () => {
    const { root } = setup('link');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a.nm-category-tile'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/app/customer/new?category=buy_for_me',
      '/app/customer/new?category=pickup_delivery',
      '/app/customer/new?category=inspection',
      '/app/customer/new?category=representation',
      '/app/customer/new?category=queue_admin',
    ]);
    expect(root.querySelector('[role="radiogroup"]')).toBeNull();
    expect(root.querySelector('.nm-category-tile--selected')).toBeNull();
    links[2].click();
    expect(navigate).toHaveBeenCalledWith('/app/customer/new?category=inspection');
  });
});
