// A.T11 (G8-15): `nm-radio-row`.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { cssRuleValues, declared, tokensOnly } from '../../../../testing/css';
import { NmRadioRow } from './radio-row.component';

@Component({
  imports: [NmRadioRow],
  template: `
    <div role="radiogroup" aria-label="How should this be paid?">
      <nm-radio-row name="g" value="a" label="Pay merchant directly (recommended)" subtitle="Sub A" [selected]="selected() === 'a'" [disabled]="disabledA()" (chosen)="pick($event)" />
      <nm-radio-row name="g" value="b" label="Send purchase amount to runner" subtitle="Sub B" [selected]="selected() === 'b'" (chosen)="pick($event)" />
      <nm-radio-row name="g" value="c" label="Third" [selected]="selected() === 'c'" (chosen)="pick($event)" />
    </div>
  `,
})
class Host {
  readonly selected = signal<string | null>(null);
  readonly disabledA = signal(false);
  readonly picks: string[] = [];
  pick(value: string): void {
    this.picks.push(value);
    this.selected.set(value);
  }
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(root.querySelectorAll<HTMLElement>('.nm-radio-row'));
  const inputs = () => Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  return { fixture, root, rows, inputs, host: fixture.componentInstance };
}

describe('nm-radio-row (A.T11, G8-15)', () => {
  it('A.T11 unselected. a native radio inside a label; accessible name `label. subtitle`; slate fill, slate-line border, pill, min-height 48, padding 10px 16px', () => {
    const { rows, inputs } = setup();
    const [a, , c] = inputs();
    expect(rows()[0].tagName).toBe('LABEL');
    expect(rows()[0].contains(a)).toBe(true);
    expect(a.getAttribute('aria-label')).toBe('Pay merchant directly (recommended). Sub A');
    expect(c.getAttribute('aria-label')).toBe('Third');
    expect(a.checked).toBe(false);
    expect(declared('.nm-radio-row', 'background-color')).toEqual(['var(--nitume-slate)']);
    expect(declared('.nm-radio-row', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-radio-row', 'border-radius')).toEqual(['var(--nitume-r-pill)']);
    expect(declared('.nm-radio-row', 'min-height')).toEqual(['48px']);
    expect(declared('.nm-radio-row', 'padding')).toEqual(['10px 16px']);
    const label = rows()[0].querySelector('.nm-radio-row__label') as HTMLElement;
    expect(getComputedStyle(label).fontSize).toBe('12px');
    expect(getComputedStyle(label).fontWeight).toBe('600');
    expect(getComputedStyle(label).color).toBe('var(--nitume-blue)');
    expect(getComputedStyle(rows()[0].querySelector('.nm-radio-row__subtitle') as HTMLElement).color).toBe('var(--nitume-slate-600)');
    expect(declared('.nm-radio-row__input', 'clip-path')).toEqual(['inset(50%)']);
  });

  it('A.T11 selected. click selects; blue fill and border, WHITE label and subtitle (never green)', () => {
    const { fixture, rows, inputs, host } = setup();
    inputs()[1].click();
    fixture.detectChanges();
    expect(host.picks).toEqual(['b']);
    expect(inputs()[1].checked).toBe(true);
    expect(rows()[1].classList).toContain('nm-radio-row--selected');
    expect(declared('.nm-radio-row--selected', 'background-color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-radio-row--selected', 'border-color')).toEqual(['var(--nitume-blue)']);
    expect(getComputedStyle(rows()[1].querySelector('.nm-radio-row__label') as HTMLElement).color).toBe('var(--nitume-white)');
    expect(getComputedStyle(rows()[1].querySelector('.nm-radio-row__subtitle') as HTMLElement).color).toBe('var(--nitume-white)');
    expect(tokensOnly()).toBe(true);
    expect(cssRuleValues(['.nm-radio-row'], 'background-color').join()).not.toContain('green');
  });

  it('A.T11 disabled. slate-400 text, aria-disabled, no change on click', () => {
    const { fixture, rows, inputs, host } = setup();
    host.disabledA.set(true);
    fixture.detectChanges();
    const a = inputs()[0];
    expect(a.getAttribute('aria-disabled')).toBe('true');
    expect(a.disabled).toBe(true);
    rows()[0].click();
    a.click();
    fixture.detectChanges();
    expect(host.picks).toEqual([]);
    expect(a.checked).toBe(false);
    expect(getComputedStyle(rows()[0].querySelector('.nm-radio-row__label') as HTMLElement).color).toBe('var(--nitume-slate-400)');
    expect(getComputedStyle(rows()[0].querySelector('.nm-radio-row__subtitle') as HTMLElement).color).toBe('var(--nitume-slate-400)');
  });

  it('A.T11 keyboard. arrow keys move focus and select within the group, wrapping and skipping disabled rows', () => {
    const { fixture, inputs, host } = setup();
    host.disabledA.set(true);
    fixture.detectChanges();
    const [, b, c] = inputs();
    b.focus();
    b.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(c);
    expect(host.picks).toEqual(['c']);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(b);
    b.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(host.picks).toEqual(['c', 'b', 'c']);
  });

  it('A.T11 focus. the row shows the green focus ring when its radio has keyboard focus; no bare outline: none', () => {
    setup();
    expect(cssRuleValues(['.nm-radio-row', 'focus-visible'], 'outline').join()).toContain('var(--nitume-green)');
  });
});
