// NC§W9.12 and the G7-28 component minimum for `nm-stepper`.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared, rawStyles } from '../../../../testing/css';
import { NmStepper } from './stepper.component';

@Component({ imports: [NmStepper], template: `<nm-stepper [completed]="done()" />` })
class Host {
  readonly done = signal(1);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const segments = () => Array.from(root.querySelectorAll('.nm-stepper__segment'));
  const classes = () => segments().map((s) => (s.classList.contains('nm-stepper__segment--done') ? 'done' : 'empty'));
  return { fixture, root, segments, classes };
}

describe('nm-stepper (NC§W9.12)', () => {
  it('NC§W9.12 segments. three segments; done/empty classes for completed 1, 2 and 3; aria-label Step n of 3', () => {
    const { fixture, root, classes } = setup();
    const img = root.querySelector('[role="img"]') as HTMLElement;
    expect(classes()).toEqual(['done', 'empty', 'empty']);
    expect(img.getAttribute('aria-label')).toBe('Step 1 of 3');
    fixture.componentInstance.done.set(2);
    fixture.detectChanges();
    expect(classes()).toEqual(['done', 'done', 'empty']);
    expect(img.getAttribute('aria-label')).toBe('Step 2 of 3');
    fixture.componentInstance.done.set(3);
    fixture.detectChanges();
    expect(classes()).toEqual(['done', 'done', 'done']);
    expect(img.getAttribute('aria-label')).toBe('Step 3 of 3');
  });

  it('G7-28. tokens: done green, empty slate-line, 4px pill segments, gap 6, padding-bottom 16; not focusable; no hex', () => {
    const { root } = setup();
    expect(declared('.nm-stepper__segment--done', 'background-color')).toEqual(['var(--nitume-green)']);
    expect(declared('.nm-stepper__segment--empty', 'background-color')).toEqual(['var(--nitume-slate-line)']);
    expect(declared('.nm-stepper__segment', 'height')).toEqual(['4px']);
    expect(declared('.nm-stepper__segment', 'border-radius')).toEqual(['var(--nitume-r-pill)']);
    expect(declared('.nm-stepper', 'gap')).toEqual(['6px']);
    expect(declared('.nm-stepper', 'padding-bottom')).toEqual(['16px']);
    expect(root.querySelector('[tabindex]')).toBeNull();
    expect(rawStyles()).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
