// H T14, H T15 at component level and the G7-28 minimum for `nm-task-row`.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { cssRuleValues, declared, rawStyles } from '../../../../testing/css';
import { ErrandStatus } from '../../status/status-presentation';
import { NmTaskRow } from './task-row.component';

const NOW = new Date(2026, 9, 29, 10, 0);

@Component({
  imports: [NmTaskRow],
  template: `<nm-task-row title="Apartment check — Nyali" [status]="status()" href="/app/customer/tasks/e-1" [time]="time()" [now]="now" />`,
})
class Host {
  readonly status = signal<ErrandStatus>('COMPLETED');
  readonly time = signal<Date | null>(new Date(2026, 9, 28, 16, 12));
  readonly now = NOW;
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('nm-task-row (G7-24)', () => {
  it('the whole row is one link followed in-app; title, meta formatDayTime in Fira Code num-meta, regular customer status chip', () => {
    const { root } = setup();
    const link = root.querySelector('a.nm-task-row') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/app/customer/tasks/e-1');
    expect(link.querySelector('.nm-task-row__title')?.textContent).toBe('Apartment check — Nyali');
    const meta = link.querySelector('[nmNum="meta"]') as HTMLElement;
    expect(meta.textContent).toBe('Yesterday, 4:12 PM');
    expect(getComputedStyle(meta).fontFamily).toBe('var(--nitume-font-num)');
    expect(getComputedStyle(meta).fontSize).toBe('11px');
    const chip = link.querySelector('nm-status-chip .nm-chip') as HTMLElement;
    expect(chip.classList.contains('nm-chip--regular')).toBe(true);
    expect(chip.classList.contains('nm-chip--success')).toBe(true);
    expect(chip.textContent).toContain('Completed');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    link.click();
    expect(navigate).toHaveBeenCalledWith('/app/customer/tasks/e-1');
  });

  it('CANCELLED reads Cancelled (danger); no time → no meta line', () => {
    const { fixture, root } = setup();
    fixture.componentInstance.status.set('CANCELLED');
    fixture.componentInstance.time.set(null);
    fixture.detectChanges();
    expect(root.querySelector('.nm-chip')?.classList.contains('nm-chip--danger')).toBe(true);
    expect(root.querySelector('.nm-chip')?.textContent).toContain('Cancelled');
    expect(root.querySelector('[nmNum]')).toBeNull();
  });

  it('G7-28. white, slate-line, r-m, padding 13 15; title row-title 13 with ellipsis; hover blue; focus ring; tokens only', () => {
    setup();
    expect(declared('.nm-task-row', 'background-color')).toEqual(['var(--nitume-white)']);
    expect(declared('.nm-task-row', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-task-row', 'border-radius')).toEqual(['var(--nitume-r-m)']);
    expect(declared('.nm-task-row', 'padding')).toEqual(['13px 15px']);
    expect(declared('.nm-task-row__title', 'font-size')).toEqual(['13px']);
    expect(declared('.nm-task-row__title', 'font-weight')).toEqual(['600']);
    expect(declared('.nm-task-row__title', 'text-overflow')).toEqual(['ellipsis']);
    expect(cssRuleValues(['.nm-task-row', ':hover'], 'border-color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-task-row:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    expect(rawStyles()).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|box-shadow/);
  });
});
