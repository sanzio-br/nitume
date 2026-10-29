// H T11, H T12 at component level and the G7-28 minimum for
// `nm-active-task-card`.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { accessibleText, declared, rawStyles } from '../../../../testing/css';
import { NmActiveTaskCard } from './active-task-card.component';

@Component({
  imports: [NmActiveTaskCard],
  template: `
    <nm-active-task-card
      category="Check It For Me"
      [reference]="reference()"
      title="Apartment check — Nyali"
      meta="Brian K. is en route"
      actionLabel="Track live →"
      actionHref="/app/customer/track/e-1"
    />
  `,
})
class Host {
  readonly reference = signal<string | null>('NT-10482');
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('nm-active-task-card (G7-23)', () => {
  it('tag: compact info chip with the category name and #reference in nmNum; null reference → name only', () => {
    const { fixture, root } = setup();
    const chip = root.querySelector('nm-status-chip .nm-chip') as HTMLElement;
    expect(chip.classList.contains('nm-chip--compact')).toBe(true);
    expect(chip.classList.contains('nm-chip--info')).toBe(true);
    expect(chip.querySelector('[nmNum]')?.textContent).toBe('#NT-10482');
    expect(accessibleText(chip)).toBe('Check It For Me #NT-10482');
    fixture.componentInstance.reference.set(null);
    fixture.detectChanges();
    expect(root.querySelector('nm-status-chip [nmNum]')).toBeNull();
    expect(accessibleText(root.querySelector('nm-status-chip') as HTMLElement)).toBe('Check It For Me');
  });

  it('tokens: blue fill, r-m, padding 18, no shadow; white card-title; meta Fira Code 12 slate-400 in nmNum', () => {
    const { root } = setup();
    expect(declared('.nm-active-task-card', 'background-color')).toEqual(['var(--nitume-blue)']);
    expect(declared('.nm-active-task-card', 'border-radius')).toEqual(['var(--nitume-r-m)']);
    expect(declared('.nm-active-task-card', 'padding')).toEqual(['18px']);
    const title = root.querySelector('.nm-active-task-card__title') as HTMLElement;
    expect(title.textContent).toBe('Apartment check — Nyali');
    expect(getComputedStyle(title).color).toBe('var(--nitume-white)');
    expect(getComputedStyle(title).fontSize).toBe('15.5px');
    const meta = root.querySelector('.nm-active-task-card__meta') as HTMLElement;
    expect(meta.hasAttribute('nmNum')).toBe(true);
    expect(meta.textContent?.trim()).toBe('Brian K. is en route');
    expect(getComputedStyle(meta).fontFamily).toBe('var(--nitume-font-num)');
    expect(getComputedStyle(meta).fontSize).toBe('12px');
    expect(getComputedStyle(meta).color).toBe('var(--nitume-slate-400)');
    expect(rawStyles()).not.toContain('box-shadow');
  });

  it('action: primary small button rendered as a link (green fill, white text), followed in-app; the card itself is not clickable', () => {
    const { root } = setup();
    const link = root.querySelector('a.nm-btn') as HTMLAnchorElement;
    expect(link.classList.contains('nm-btn--primary')).toBe(true);
    expect(link.classList.contains('nm-btn--small')).toBe(true);
    expect(link.getAttribute('href')).toBe('/app/customer/track/e-1');
    expect(link.textContent?.trim()).toBe('Track live →');
    expect(getComputedStyle(link).color).toBe('var(--nitume-white)');
    expect(root.querySelectorAll('a, button')).toHaveLength(1);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    link.click();
    expect(navigate).toHaveBeenCalledWith('/app/customer/track/e-1');
  });

  it('G7-28. the action keeps the kit focus ring; custom-property names only, no hex', () => {
    setup();
    expect(declared('.nm-btn:focus-visible', 'outline').join()).toContain('var(--nitume-green)');
    expect(rawStyles()).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
