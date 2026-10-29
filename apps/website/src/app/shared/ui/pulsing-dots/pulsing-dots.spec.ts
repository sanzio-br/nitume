// A.T10 (G8-18): `nm-pulsing-dots`.
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared, tokensOnly } from '../../../../testing/css';
import { NmPulsingDots } from './pulsing-dots.component';

@Component({ imports: [NmPulsingDots], template: `<nm-pulsing-dots label="Waiting for your quote" />` })
class Host {}

/** `prop` of `selector` inside a `prefers-reduced-motion: reduce` media rule. */
function reducedMotion(selector: string, prop: string): string[] {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSMediaRule) || !rule.conditionText.includes('prefers-reduced-motion')) continue;
      for (const inner of Array.from(rule.cssRules)) {
        if (inner instanceof CSSStyleRule && inner.selectorText.replace(/\[_ng[^\]]+\]/g, '').trim() === selector) {
          out.push(inner.style.getPropertyValue(prop));
        }
      }
    }
  }
  return out;
}

describe('nm-pulsing-dots (A.T10, G8-18)', () => {
  it('A.T10. three dots hidden from assistive tech inside role="status" named by the visually hidden label', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const status = root.querySelector('[role="status"]') as HTMLElement;
    expect(status).not.toBeNull();
    const dots = status.querySelectorAll('.nm-dots__dot');
    expect(dots).toHaveLength(3);
    expect(Array.from(dots).every((d) => d.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(status.querySelector('.nm-dots__label')?.textContent).toBe('Waiting for your quote');
    expect(declared('.nm-dots__label', 'clip-path')).toEqual(['inset(50%)']);
  });

  it('A.T10. 7px slate-400 dots, gap 6, a 1.2 s CSS pulse staggered by 0.2 s; static under reduced motion', () => {
    TestBed.createComponent(Host).detectChanges();
    expect(declared('.nm-dots__dot', 'width')).toEqual(['7px']);
    expect(declared('.nm-dots__dot', 'height')).toEqual(['7px']);
    expect(declared('.nm-dots__dot', 'background-color')).toEqual(['var(--nitume-slate-400)']);
    expect(declared('.nm-dots', 'gap')).toEqual(['6px']);
    expect(declared('.nm-dots__dot', 'animation').join()).toContain('1.2s');
    expect(declared('.nm-dots__dot:nth-child(2)', 'animation-delay')).toEqual(['0.2s']);
    expect(declared('.nm-dots__dot:nth-child(3)', 'animation-delay')).toEqual(['0.4s']);
    expect(reducedMotion('.nm-dots__dot', 'animation')).toEqual(['none']);
    expect(tokensOnly()).toBe(true);
  });
});
