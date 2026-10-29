import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { cssRuleValues, declared } from '../../../../testing/css';
import { NmCard } from './card.component';
import { NmSectionLabel } from './section-label.component';

describe('card and section label (§12.4)', () => {
  it('22. nm-card: solid/dashed borders; clickable variant is keyboard-activatable with a focus ring', () => {
    @Component({
      imports: [NmCard],
      template: `
        <nm-card id="solid">Body</nm-card>
        <nm-card id="dashed" border="dashed">Receipt</nm-card>
        <nm-card id="zone" border="dashed" [dashedWidth]="2" padding="24px">Drop</nm-card>
        <nm-card id="click" [clickable]="true" label="Open task" (activated)="opened = opened + 1">Task</nm-card>
        <nm-card id="link" [clickable]="true" href="/app/customer/tasks/1" label="Task 1">Task 1</nm-card>
      `,
    })
    class Host {
      opened = 0;
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;

    const solid = q('#solid .nm-card');
    expect(getComputedStyle(solid).backgroundColor).toBe('var(--nitume-white)');
    expect(getComputedStyle(solid).borderTopStyle).toBe('solid');
    expect(getComputedStyle(solid).borderTopWidth).toBe('1px');
    expect(declared('.nm-card', 'border-color')).toEqual(['var(--nitume-slate-line)']);
    expect(getComputedStyle(solid).borderRadius).toBe('var(--nitume-r-m)');
    expect(solid.style.padding).toBe('16px');
    expect(solid.textContent?.trim()).toBe('Body');

    expect(getComputedStyle(q('#dashed .nm-card')).borderTopStyle).toBe('dashed');
    expect(getComputedStyle(q('#dashed .nm-card')).borderTopWidth).toBe('1px');
    expect(getComputedStyle(q('#zone .nm-card')).borderTopStyle).toBe('dashed');
    expect(getComputedStyle(q('#zone .nm-card')).borderTopWidth).toBe('2px');
    expect(q('#zone .nm-card').style.padding).toBe('24px');

    // Clickable: a real <button> (Enter/Space activate natively), focus ring.
    const button = q('#click .nm-card') as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Open task');
    button.focus();
    expect(document.activeElement).toBe(button);
    button.click();
    expect(fixture.componentInstance.opened).toBe(1);
    expect(cssRuleValues(['.nm-card--clickable', ':focus-visible'], 'outline')).toContain(
      '2px solid var(--nitume-green)',
    );
    expect(declared('.nm-card--clickable:hover', 'border-color')).toEqual(['var(--nitume-blue)']);

    const link = q('#link .nm-card');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/app/customer/tasks/1');
    expect(link.classList).toContain('nm-card--clickable');
  });

  it('23. nm-section-label: uppercase through CSS, DOM text unchanged, heading level from input', () => {
    @Component({
      imports: [NmSectionLabel],
      template: `<nm-section-label [level]="level()" [inset]="inset()">Active tasks</nm-section-label>`,
    })
    class Host {
      readonly level = signal<1 | 2 | 3 | 4>(2);
      readonly inset = signal(true);
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const heading = () => fixture.nativeElement.querySelector('.nm-section-label') as HTMLElement;

    expect(heading().tagName).toBe('H2');
    expect(heading().textContent).toBe('Active tasks');
    const cs = getComputedStyle(heading());
    expect(cs.textTransform).toBe('uppercase');
    expect(cs.fontSize).toBe('11.5px');
    expect(cs.fontWeight).toBe('700');
    expect(cs.letterSpacing).toBe('0.05em');
    expect(cs.color).toBe('var(--nitume-slate-600)');
    expect(cs.paddingTop).toBe('6px');
    expect(cs.paddingLeft).toBe('20px');
    expect(cs.paddingBottom).toBe('10px');

    fixture.componentInstance.level.set(3);
    fixture.componentInstance.inset.set(false);
    fixture.detectChanges();
    expect(heading().tagName).toBe('H3');
    expect(heading().textContent).toBe('Active tasks');
    expect(getComputedStyle(heading()).paddingLeft).toBe('0px');
  });
});
