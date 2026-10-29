// G7-18 / G7-28: `nm-choice-chip` and `nm-choice-chip-group` (ND T14 at
// component level).
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared, tokensOnly } from '../../../../testing/css';
import { NmChoiceChipGroup, NmChoiceOption } from './choice-chip-group.component';

const OPTIONS: NmChoiceOption[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'flexible', label: 'Flexible' },
];

@Component({
  imports: [NmChoiceChipGroup],
  template: `
    <span id="dl">Deadline</span>
    <nm-choice-chip-group [options]="options" [selected]="selected()" [disabled]="disabled()" labelledBy="dl" (selectedChange)="selected.set($event)" />
  `,
})
class Host {
  readonly options = OPTIONS;
  readonly selected = signal<string | null>('today');
  readonly disabled = signal(false);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host: fixture.componentInstance,
    root,
    chips: () => Array.from(root.querySelectorAll<HTMLButtonElement>('[role="radio"]')),
    update: () => fixture.detectChanges(),
  };
}

describe('nm-choice-chip-group (G7-18)', () => {
  it('renders the options as radios in a radiogroup named by aria-labelledby; one aria-checked', () => {
    const { root, chips } = setup();
    expect(root.querySelector('[role="radiogroup"]')?.getAttribute('aria-labelledby')).toBe('dl');
    expect(chips().map((c) => c.textContent?.trim())).toEqual(['Today', 'Tomorrow', 'Flexible']);
    expect(chips().map((c) => c.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
  });

  it('roving tabindex; arrow keys move and select with wrap; click selects', () => {
    const { host, chips, update } = setup();
    expect(chips().map((c) => c.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    chips()[0].focus();
    chips()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    update();
    expect(host.selected()).toBe('flexible');
    expect(document.activeElement).toBe(chips()[2]);
    chips()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    update();
    expect(host.selected()).toBe('today');
    chips()[1].click();
    update();
    expect(host.selected()).toBe('tomorrow');
    expect(chips().map((c) => c.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('selected: blue fill and border with white text (never green); unselected: slate fill, slate-line border, blue chip text', () => {
    setup();
    expect(declared('.nm-choice-chip--selected', 'background-color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-choice-chip--selected', 'border-color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-choice-chip--selected', 'color')).toEqual(['var(--nitume-white)']);
    expect(declared('.nm-choice-chip', 'background-color')).toEqual(['var(--nitume-slate)']);
    expect(declared('.nm-choice-chip', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-choice-chip', 'color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-choice-chip', 'padding')).toEqual(['8px 13px']);
    expect(declared('.nm-choice-chip', 'font-size')).toEqual(['12px']);
    expect(declared('.nm-choice-chip', 'border-radius')).toEqual(['var(--nitume-r-pill)']);
  });

  it('disabled (#8 saving): aria-disabled, clicks and arrows change nothing, slate-400 text', () => {
    const { host, chips, update } = setup();
    host.disabled.set(true);
    update();
    expect(chips().every((c) => c.getAttribute('aria-disabled') === 'true')).toBe(true);
    chips()[2].click();
    chips()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    update();
    expect(host.selected()).toBe('today');
    expect(declared('.nm-choice-chip--disabled', 'color')).toEqual(['var(--nitume-slate-400)']);
  });

  it('G7-28. accessible name is the label; 48px hit area; focus ring; tokens only', () => {
    const { chips } = setup();
    expect(chips()[1].textContent?.trim()).toBe('Tomorrow');
    expect(declared('.nm-choice-chip::before', 'height')).toEqual(['max(100%, var(--nitume-tap))']);
    expect(declared('.nm-choice-chip:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    expect(tokensOnly()).toBe(true);
  });
});
