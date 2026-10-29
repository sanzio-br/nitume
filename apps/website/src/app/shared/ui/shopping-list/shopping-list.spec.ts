// ND T13 at component level and the G7-28 minimum for `nm-shopping-list`.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared, rawStyles } from '../../../../testing/css';
import { NmShoppingItem, NmShoppingList } from './shopping-list.component';

@Component({
  imports: [NmShoppingList],
  template: `<nm-shopping-list [items]="items()" [error]="error()" (itemsChange)="items.set($event)" />`,
})
class Host {
  readonly items = signal<NmShoppingItem[]>([{ name: '', quantity: 1 }]);
  readonly error = signal<string | null>(null);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(root.querySelectorAll('.nm-shopping-list__row'));
  const add = () => root.querySelector('nm-button.nm-shopping-list__add button') as HTMLButtonElement | null;
  const update = () => fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, root, rows, add, update };
}

describe('nm-shopping-list (G7-27)', () => {
  it('one empty row: name field Item 1 with the placeholder and maxlength 80; no remove button; + Add item', () => {
    const { rows, root, add } = setup();
    expect(rows()).toHaveLength(1);
    const input = root.querySelector('input') as HTMLInputElement;
    expect(input.labels?.[0]?.textContent).toBe('Item 1');
    expect(input.getAttribute('placeholder')).toBe('Item, e.g. 2kg sugar');
    expect(input.getAttribute('maxlength')).toBe('80');
    expect(root.querySelector('.nm-shopping-list__remove')).toBeNull();
    expect(add()?.textContent?.trim()).toBe('+ Add item');
  });

  it('adding focuses the new row; the link hides at 30 rows; remove shows from two rows', () => {
    const { rows, root, add, update } = setup();
    add()?.click();
    update();
    expect(rows()).toHaveLength(2);
    expect(document.activeElement).toBe(root.querySelectorAll('input')[1]);
    expect(root.querySelectorAll('.nm-shopping-list__remove')).toHaveLength(2);
    for (let i = 2; i < 30; i++) {
      add()?.click();
      update();
    }
    expect(rows()).toHaveLength(30);
    expect(add()).toBeNull();
    (root.querySelector('.nm-shopping-list__remove') as HTMLButtonElement).click();
    update();
    expect(rows()).toHaveLength(29);
    expect(add()).not.toBeNull();
  });

  it('quantity 1–99: − has aria-disabled at 1 and + at 99; clicks beyond the bounds change nothing; value in Fira Code', () => {
    const { host, root, update } = setup();
    const [minus, plus] = Array.from(root.querySelectorAll<HTMLButtonElement>('.nm-shopping-list__step'));
    expect(minus.getAttribute('aria-disabled')).toBe('true');
    minus.click();
    update();
    expect(host.items()[0].quantity).toBe(1);
    plus.click();
    update();
    expect(host.items()[0].quantity).toBe(2);
    expect(minus.hasAttribute('aria-disabled')).toBe(false);
    host.items.set([{ name: 'Sugar', quantity: 99 }]);
    update();
    expect(plus.getAttribute('aria-disabled')).toBe('true');
    plus.click();
    update();
    expect(host.items()[0].quantity).toBe(99);
    const value = root.querySelector('.nm-shopping-list__qty [nmNum]') as HTMLElement;
    expect(value.textContent).toBe('99');
    expect(getComputedStyle(value).fontFamily).toBe('var(--nitume-font-num)');
    expect(root.querySelector('.nm-shopping-list__qty')?.textContent).toBe('Quantity 99');
  });

  it('accessible names include the item name when it is set', () => {
    const { host, root, update } = setup();
    host.items.set([
      { name: '2kg sugar', quantity: 2 },
      { name: '', quantity: 1 },
    ]);
    update();
    const labels = Array.from(root.querySelectorAll('button[aria-label]')).map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Decrease quantity of 2kg sugar',
      'Increase quantity of 2kg sugar',
      'Remove item 2kg sugar',
      'Decrease quantity',
      'Increase quantity',
      'Remove item',
    ]);
  });

  it('typing emits the full list, unnamed rows included; error renders as an alert', () => {
    const { host, root, update } = setup();
    const input = root.querySelector('input') as HTMLInputElement;
    input.value = 'Milk';
    input.dispatchEvent(new Event('input'));
    update();
    expect(host.items()).toEqual([{ name: 'Milk', quantity: 1 }]);
    host.error.set('Add at least one item.');
    update();
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('Add at least one item.');
  });

  it('G7-28. 32px white circles with slate-line borders, blue icons (slate-400 disabled), 48px hit areas, hairlines between rows, focus ring, tokens only', () => {
    setup();
    expect(declared('.nm-shopping-list__circle', 'width')).toEqual(['32px']);
    expect(declared('.nm-shopping-list__circle', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-shopping-list__circle', 'background-color')).toEqual(['var(--nitume-white)']);
    expect(declared('.nm-shopping-list__step', 'color')).toEqual(['var(--nitume-blue)']);
    expect(declared(".nm-shopping-list__step[aria-disabled='true']", 'color').concat(declared('.nm-shopping-list__step[aria-disabled="true"]', 'color'))).toEqual(['var(--nitume-slate-400)']);
    expect(declared('.nm-shopping-list__step::before', 'height')).toEqual(['max(100%, var(--nitume-tap))']);
    expect(declared('.nm-shopping-list__remove', 'width')).toEqual(['var(--nitume-tap)']);
    expect(declared('.nm-shopping-list__row + .nm-shopping-list__row', 'border-top')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-shopping-list__step:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    expect(rawStyles()).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|box-shadow/);
  });
});
