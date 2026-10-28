import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { cssRuleValues, declared } from '../../../../testing/css';
import { NmCheckbox } from './checkbox.component';
import { NmListGroup } from './list-group.component';
import { NmListItem, NmListProgress } from './list-item.component';
import { NmStepCard } from './step-card.component';

describe('checklist, checkbox (§12.4)', () => {
  it('18. nm-checkbox: visuals, Space toggles, disabled blocks change, label row is clickable', () => {
    @Component({
      imports: [NmCheckbox],
      template: `
        <nm-checkbox id="plain" ariaLabel="Receipt" [(checked)]="checked" [disabled]="disabled()" />
        <nm-checkbox id="row" label="Photos" [(checked)]="rowChecked" />
      `,
    })
    class Host {
      checked = false;
      rowChecked = false;
      readonly disabled = signal(false);
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;
    const input = () => q('#plain input') as HTMLInputElement;
    const box = () => q('#plain .nm-check__box');

    // Unchecked: 22px white box with a 2px slate-line border, radius 6.
    expect(declared('.nm-check__box', 'border')).toEqual(['2px solid var(--nitume-slate-line)']);
    expect(getComputedStyle(box()).backgroundColor).toBe('var(--nitume-white)');
    expect(getComputedStyle(box()).width).toBe('22px');
    expect(getComputedStyle(box()).borderRadius).toBe('6px');
    expect(box().querySelector('svg')).toBeNull();
    expect(box().getAttribute('aria-hidden')).toBe('true');

    // Native checkbox under the box: keyboard + screen reader, 48×48 hit area.
    expect(input().type).toBe('checkbox');
    expect(input().getAttribute('aria-label')).toBe('Receipt');
    expect(getComputedStyle(input()).opacity).toBe('0');
    expect(getComputedStyle(input()).width).toBe('var(--nitume-tap)');
    expect(getComputedStyle(input()).height).toBe('var(--nitume-tap)');
    expect(cssRuleValues([':focus-visible', '.nm-check__box'], 'outline')).toContain(
      '2px solid var(--nitume-green)',
    );

    // Space on a focused native checkbox fires its activation behaviour
    // (click). jsdom has no keyboard activation, so trigger it directly.
    input().focus();
    expect(document.activeElement).toBe(input());
    input().click();
    fixture.detectChanges();
    expect(host.checked).toBe(true);
    expect(getComputedStyle(box()).backgroundColor).toBe('var(--nitume-green)');
    expect(declared('.nm-check--checked .nm-check__box', 'border-color')).toEqual([
      'var(--nitume-green)',
    ]);
    expect(getComputedStyle(box()).color).toBe('var(--nitume-white)');
    expect(box().querySelector('svg path')?.getAttribute('d')).toBe('M20 6 9 17l-5-5');
    expect(getComputedStyle(box().querySelector('svg')!).width).toBe('12px');

    // Disabled: no change.
    host.disabled.set(true);
    fixture.detectChanges();
    expect(input().disabled).toBe(true);
    input().click();
    fixture.detectChanges();
    expect(host.checked).toBe(true);

    // Label variant: clicking the label text toggles.
    const rowLabel = q('#row .nm-check__label');
    expect(rowLabel.textContent).toBe('Photos');
    expect(getComputedStyle(rowLabel).color).toBe('var(--nitume-blue)');
    expect(getComputedStyle(rowLabel).fontSize).toBe('13.5px');
    rowLabel.click();
    fixture.detectChanges();
    expect(host.rowChecked).toBe(true);
    expect(getComputedStyle(q('#row .nm-check')).cursor).toBe('pointer');
  });

  it('19. nm-list-item: title, Fira Code meta and counter, done strike-through, complete counter, accessible name', () => {
    @Component({
      imports: [NmListGroup, NmListItem],
      template: `
        <nm-list-group>
          <nm-list-item title="Buy groceries" meta="Today, 10:03 AM" [progress]="progress()" [done]="done()" />
        </nm-list-group>
      `,
    })
    class Host {
      readonly progress = signal<NmListProgress>({ done: 3, total: 5 });
      readonly done = signal(false);
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const item = fixture.nativeElement.querySelector('nm-list-item') as HTMLElement;
    const title = () => item.querySelector('.nm-li__title') as HTMLElement;
    const meta = item.querySelector('.nm-li__meta') as HTMLElement;
    const counter = () => item.querySelector('.nm-li__progress') as HTMLElement;

    expect(item.getAttribute('role')).toBe('listitem');
    expect(title().textContent).toBe('Buy groceries');
    expect(getComputedStyle(title()).fontSize).toBe('14.5px');
    expect(getComputedStyle(title()).color).toBe('var(--nitume-blue)');
    expect(getComputedStyle(meta).fontFamily).toBe('var(--nitume-font-num)');
    expect(getComputedStyle(meta).fontSize).toBe('12px');
    expect(getComputedStyle(meta).color).toBe('var(--nitume-slate-600)');
    expect(counter().textContent).toBe('3/5');
    expect(getComputedStyle(counter()).fontFamily).toBe('var(--nitume-font-num)');
    expect(getComputedStyle(counter()).fontSize).toBe('12.5px');
    expect(getComputedStyle(counter()).color).toBe('var(--nitume-slate-600)');
    expect(item.getAttribute('aria-label')).toBe('Buy groceries, Today, 10:03 AM, 3 of 5');

    host.progress.set({ done: 5, total: 5 });
    host.done.set(true);
    fixture.detectChanges();
    expect(counter().textContent).toBe('5/5');
    expect(getComputedStyle(counter()).color).toBe('var(--nitume-green-700)');
    expect(getComputedStyle(title()).color).toBe('var(--nitume-slate-600)');
    expect(getComputedStyle(title()).textDecorationLine).toBe('line-through');
    expect(getComputedStyle(title()).textDecorationColor).toBe('var(--nitume-slate-line)');
    expect(item.querySelector('.nm-check--checked')).not.toBeNull();
    expect(item.getAttribute('aria-label')).toBe(
      'Buy groceries, Today, 10:03 AM, 5 of 5, completed',
    );

    // A preformatted counter string works the same way.
    host.progress.set('2/4');
    fixture.detectChanges();
    expect(counter().textContent).toBe('2/4');
    expect(getComputedStyle(counter()).color).toBe('var(--nitume-slate-600)');
  });

  it('20. nm-list-group: hairlines between items, none after the last', () => {
    @Component({
      imports: [NmListGroup, NmListItem],
      template: `
        <nm-list-group>
          <nm-list-item title="One" />
          <nm-list-item title="Two" [clickable]="true" (activated)="activated = activated + 1" />
          <nm-list-item title="Three" [checkable]="true" (checkedChange)="checked = $event" />
        </nm-list-group>
      `,
    })
    class Host {
      activated = 0;
      checked: boolean | null = null;
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const list = fixture.nativeElement.querySelector('ul') as HTMLElement;
    expect(list.getAttribute('role')).toBe('list');
    expect(getComputedStyle(list).backgroundColor).toBe('var(--nitume-white)');
    expect(getComputedStyle(list).borderRadius).toBe('var(--nitume-r-m)');
    expect(getComputedStyle(list).overflow).toBe('hidden');
    expect(declared('.nm-list', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);

    const items = Array.from(list.querySelectorAll('nm-list-item')) as HTMLElement[];
    expect(items).toHaveLength(3);
    const hairline = declared(':not(:last-child)', 'border-bottom');
    expect(hairline).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(items.map((i) => i.matches(':not(:last-child)'))).toEqual([true, true, false]);

    // Clickable row is a button; checkable row's checkbox emits.
    const button = items[1].querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Two');
    button.click();
    expect(fixture.componentInstance.activated).toBe(1);
    (items[2].querySelector('input') as HTMLInputElement).click();
    expect(fixture.componentInstance.checked).toBe(true);
    expect(items[0].querySelector('input')).toBeNull(); // display-only box
  });

  it('21. nm-step-card: done check, Fira Code subtitle, small secondary action, whole card runs it, accessible names', () => {
    @Component({
      imports: [NmStepCard],
      template: `
        <nm-step-card id="todo" title="Photos" subtitle="Required" actionLabel="Upload" (action)="runs = runs + 1" />
        <nm-step-card id="done" title="Arrived" subtitle="10:28 AM · GPS confirmed" [done]="true" />
      `,
    })
    class Host {
      runs = 0;
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;

    const card = q('#todo .nm-step');
    expect(getComputedStyle(card).backgroundColor).toBe('var(--nitume-white)');
    expect(getComputedStyle(card).borderRadius).toBe('var(--nitume-r-m)');
    expect(getComputedStyle(card).paddingTop).toBe('13px');
    expect(getComputedStyle(card).paddingLeft).toBe('15px');
    expect(getComputedStyle(q('#todo .nm-step__title')).fontSize).toBe('13px');
    expect(getComputedStyle(q('#todo .nm-step__title')).fontWeight).toBe('600');
    const subtitle = q('#todo .nm-step__subtitle');
    expect(getComputedStyle(subtitle).fontFamily).toBe('var(--nitume-font-num)');
    expect(getComputedStyle(subtitle).fontSize).toBe('11px');
    expect(getComputedStyle(subtitle).color).toBe('var(--nitume-slate-600)');

    const button = q('#todo nm-button button');
    expect(button.classList).toContain('nm-btn--secondary');
    expect(button.classList).toContain('nm-btn--small');
    expect(button.textContent?.trim()).toBe('Upload');
    button.click();
    expect(fixture.componentInstance.runs).toBe(1); // once, not twice
    card.click();
    expect(fixture.componentInstance.runs).toBe(2);
    expect(card.getAttribute('aria-label')).toBe('Photos, Required, button Upload');

    // Done: green check (complete state), no action, "completed" in the name.
    const done = q('#done .nm-step');
    expect(done.querySelector('.nm-check--checked')).not.toBeNull();
    expect(done.querySelector('input')).toBeNull(); // display-only
    expect(done.querySelector('nm-button')).toBeNull();
    expect(done.getAttribute('aria-label')).toBe('Arrived, 10:28 AM · GPS confirmed, completed');
    done.click();
    expect(fixture.componentInstance.runs).toBe(2);
  });
});
