import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NmTimeline, NmTimelineStep } from './timeline.component';

describe('nm-timeline (§12.6)', () => {
  it('29. done/pending dot tokens, no connector on the last step, Fira Code time, aria-label per step', () => {
    @Component({
      imports: [NmTimeline],
      template: `<nm-timeline [steps]="steps" />`,
    })
    class Host {
      readonly steps: NmTimelineStep[] = [
        { title: 'Task requested', time: '10:03 AM', done: true },
        { title: 'Runner assigned', time: 'Expected 10:28 AM', done: false },
        { title: 'Completed', done: false },
      ];
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const items = Array.from(root.querySelectorAll('ol > li')) as HTMLElement[];
    expect(root.querySelector('ol')).not.toBeNull();
    expect(items).toHaveLength(3);

    const dots = items.map((li) => li.querySelector('.nm-tl__dot') as HTMLElement);
    expect(getComputedStyle(dots[0]).backgroundColor).toBe('var(--nitume-green)');
    expect(getComputedStyle(dots[1]).backgroundColor).toBe('var(--nitume-slate-400)');
    expect(getComputedStyle(dots[0]).width).toBe('9px');
    expect(getComputedStyle(dots[0]).top).toBe('2px');

    expect(items[0].querySelector('.nm-tl__connector')).not.toBeNull();
    expect(items[1].querySelector('.nm-tl__connector')).not.toBeNull();
    expect(items[2].querySelector('.nm-tl__connector')).toBeNull();
    const connector = items[0].querySelector('.nm-tl__connector') as HTMLElement;
    expect(getComputedStyle(connector).backgroundColor).toBe('var(--nitume-slate-line)');
    expect(getComputedStyle(connector).width).toBe('1px');
    expect(getComputedStyle(connector).left).toBe('4px');

    const time = items[0].querySelector('.nm-tl__time') as HTMLElement;
    expect(time.textContent).toBe('10:03 AM');
    expect(getComputedStyle(time).fontFamily).toBe('var(--nitume-font-num)');
    expect(getComputedStyle(time).fontSize).toBe('11px');
    expect(items[2].querySelector('.nm-tl__time')).toBeNull();

    const title = items[0].querySelector('.nm-tl__title') as HTMLElement;
    expect(getComputedStyle(title).fontSize).toBe('12.5px');
    expect(getComputedStyle(title).fontWeight).toBe('400');
    expect(getComputedStyle(title).fontFamily).toBe('var(--nitume-font-ui)');
    expect(getComputedStyle(items[0]).paddingBottom).toBe('18px');

    expect(items.map((li) => li.getAttribute('aria-label'))).toEqual([
      'Task requested, 10:03 AM, done',
      'Runner assigned, Expected 10:28 AM, pending',
      'Completed, pending',
    ]);
    expect(items[0].querySelector('.nm-tl__text')?.getAttribute('aria-hidden')).toBe('true');
  });
});
