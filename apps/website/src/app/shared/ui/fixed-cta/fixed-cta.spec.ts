// NC§W9.14 and the G7-28 component minimum for `nm-fixed-cta`.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { cssRuleValues, declared, noShadow, rawStyles, tokensOnly } from '../../../../testing/css';
import { stubViewport } from '../../../../testing/media';
import { NmFixedCta, NmFixedCtaOffset } from './fixed-cta.component';

@Component({
  imports: [NmFixedCta],
  template: `
    @if (shown()) {
      <nm-fixed-cta (heightChange)="heights.push($event)">
        @if (above()) {
          <p nmCtaAbove class="above">We don't cover this location yet.</p>
        }
        <button type="button" class="cta">Continue →</button>
      </nm-fixed-cta>
    }
  `,
})
class Host {
  readonly shown = signal(true);
  readonly above = signal(false);
  readonly heights: number[] = [];
}

function setup(width = 360) {
  const restore = stubViewport(width);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  restore();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, bar: root.querySelector('.nm-fixed-cta__bar') as HTMLElement };
}

describe('nm-fixed-cta (NC§W9.14)', () => {
  it('NC§W9.14 below 768px. fixed to the bottom on the slate token, padding 8px 20px 6px plus the safe-area inset, no shadow', () => {
    const { bar, root } = setup();
    expect(root.querySelector('.cta')?.textContent).toBe('Continue →');
    expect(getComputedStyle(bar).position).toBe('fixed');
    expect(getComputedStyle(bar).bottom).toBe('0px');
    expect(declared('.nm-fixed-cta__bar', 'background-color')).toEqual(['var(--nitume-slate)']);
    const cs = getComputedStyle(bar);
    expect([cs.paddingTop, cs.paddingRight, cs.paddingLeft]).toEqual(['8px', '20px', '20px']);
    expect(rawStyles()).toContain('padding:8px20px6px;padding-bottom:calc(6px+env(safe-area-inset-bottom))');
    expect(noShadow()).toBe(true);
  });

  it('NC§W9.14 from 768px. inline (declared @media (min-width: 768px) rule), 16px below the last card, no spacer', () => {
    setup(1024);
    expect(declared('.nm-fixed-cta__bar', 'position')).toEqual(['fixed', 'static']);
    expect(declared('.nm-fixed-cta__bar', 'margin-top')).toEqual(['16px']);
    expect(declared('.nm-fixed-cta__spacer', 'display')).toEqual(['none']);
    const media = Array.from(document.styleSheets).flatMap((s) =>
      Array.from(s.cssRules).filter((r) => r instanceof CSSMediaRule && r.conditionText.includes('min-width: 768px')),
    );
    expect(media.some((m) => (m as CSSMediaRule).cssText.includes('nm-fixed-cta__bar'))).toBe(true);
  });

  it('NC§W9.14 above slot. projected [nmCtaAbove] content sits 10px above the button; hidden when empty', () => {
    const { fixture, root } = setup();
    const above = root.querySelector('.nm-fixed-cta__above') as HTMLElement;
    expect(above.children).toHaveLength(0);
    expect(declared('.nm-fixed-cta__above:empty', 'display')).toEqual(['none']);
    fixture.componentInstance.above.set(true);
    fixture.detectChanges();
    expect(above.querySelector('.above')?.textContent).toContain("We don't cover");
    expect(above.nextElementSibling?.classList.contains('cta')).toBe(true);
    expect(declared('.nm-fixed-cta__above', 'margin-bottom')).toEqual(['10px']);
  });

  it('NC§W9.14 toast offset. equals the bar height below 768px and 0 from 768px (stubbed matchMedia); 0 once the bar is gone', () => {
    const offset = TestBed.inject(NmFixedCtaOffset);
    let { fixture, bar } = setup(360);
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height: 64 } as DOMRect);
    expect(offset.toastOffset()).toBe(64);
    fixture.componentInstance.shown.set(false);
    fixture.detectChanges();
    expect(offset.toastOffset()).toBe(0);
    ({ fixture, bar } = setup(1024));
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height: 64 } as DOMRect);
    expect(offset.toastOffset()).toBe(0);
  });

  it('G7-28. the spacer is aria-hidden, the projected button keeps its own name and focus ring (no outline suppression), tokens only', () => {
    const { root } = setup();
    expect(root.querySelector('.nm-fixed-cta__spacer')?.getAttribute('aria-hidden')).toBe('true');
    expect((root.querySelector('.cta') as HTMLButtonElement).textContent).toBe('Continue →');
    expect(cssRuleValues(['.nm-fixed-cta'], 'outline')).toEqual([]);
    expect(tokensOnly()).toBe(true);
  });
});
