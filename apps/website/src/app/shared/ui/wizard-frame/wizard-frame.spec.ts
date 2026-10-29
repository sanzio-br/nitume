// NC§W9.13, NC§W9.8 (the frame's beforeunload listener) and the G7-28
// component minimum for `nm-wizard-frame`.
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { declared, tokensOnly } from '../../../../testing/css';
import { NmBackEvent } from '../back-button/back-button.component';
import { NmWizardFrame } from './wizard-frame.component';

@Component({
  imports: [NmWizardFrame],
  template: `
    @if (shown()) {
      <nm-wizard-frame
        title="Review"
        [step]="step()"
        backFallback="/app/customer/new/details"
        [backDisabled]="backDisabled()"
        [unloadGuard]="guard"
        (back)="onBack($event)"
      >
        <section class="body">Body</section>
        <p nmWizardAbove class="above">Above</p>
        <button nmWizardCta type="button" class="cta">Submit task →</button>
      </nm-wizard-frame>
    }
  `,
})
class Host {
  readonly shown = signal(true);
  readonly step = signal(3);
  readonly backDisabled = signal(false);
  guarded = true;
  readonly guard = () => this.guarded;
  readonly backs: NmBackEvent[] = [];
  onBack(e: NmBackEvent) {
    e.preventDefault();
    this.backs.push(e);
  }
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, host: fixture.componentInstance, root };
}

function unload(): Event {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe('nm-wizard-frame (NC§W9.13)', () => {
  it('NC§W9.13 header. pushed-header h1 and Step n of 3 in nmNum, then the stepper, the body and the CTA bar with the above slot', () => {
    const { root } = setup();
    expect(root.querySelector('nm-pushed-header h1')?.textContent).toBe('Review');
    const counter = root.querySelector('nm-pushed-header [nmNum]') as HTMLElement;
    expect(counter.textContent?.trim()).toBe('Step 3 of 3');
    expect(getComputedStyle(counter).fontFamily).toBe('var(--nitume-font-num)');
    expect(root.querySelector('nm-stepper [role="img"]')?.getAttribute('aria-label')).toBe('Step 3 of 3');
    const order = Array.from(root.querySelector('.nm-wizard-frame')?.children ?? []).map((c) => c.tagName.toLowerCase());
    expect(order).toEqual(['nm-pushed-header', 'nm-stepper', 'div', 'nm-fixed-cta']);
    expect(root.querySelector('.nm-wizard-frame__body .body')?.textContent).toBe('Body');
    const bar = root.querySelector('nm-fixed-cta .nm-fixed-cta__bar') as HTMLElement;
    expect(bar.querySelector('.nm-fixed-cta__above .above')?.textContent).toBe('Above');
    expect(bar.querySelector(':scope > .cta')?.textContent).toBe('Submit task →');
  });

  it('NC§W9.13 backDisabled. the back button gets disabled and aria-disabled and does not navigate; back is re-emitted when enabled', () => {
    const { fixture, host, root } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    host.backDisabled.set(true);
    fixture.detectChanges();
    const back = root.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    expect(back.getAttribute('aria-disabled')).toBe('true');
    back.dispatchEvent(new MouseEvent('click'));
    expect(host.backs).toHaveLength(0);
    expect(navigate).not.toHaveBeenCalled();
    host.backDisabled.set(false);
    fixture.detectChanges();
    back.click();
    expect(host.backs).toHaveLength(1);
  });

  it('NC§W9.13 column. full width below 768px; @media (min-width: 768px) caps the column at 640px and centres it', () => {
    setup();
    expect(declared('.nm-wizard-frame', 'max-width')).toEqual(['640px']);
    expect(declared('.nm-wizard-frame', 'margin')).toEqual(['0px auto']);
    const media = Array.from(document.styleSheets).flatMap((s) =>
      Array.from(s.cssRules).filter((r) => r instanceof CSSMediaRule && r.conditionText.includes('min-width: 768px')),
    );
    expect(media.some((m) => (m as CSSMediaRule).cssText.includes('max-width: 640px'))).toBe(true);
  });

  it('NC§W9.8 beforeunload. prevented only while the guard is true; no listener remains after the frame is destroyed', () => {
    const { fixture, host } = setup();
    expect(unload().defaultPrevented).toBe(true);
    host.guarded = false;
    expect(unload().defaultPrevented).toBe(false);
    host.guarded = true;
    host.shown.set(false);
    fixture.detectChanges();
    expect(unload().defaultPrevented).toBe(false);
  });

  it('G7-28. back button name and focus ring from the header; fields keep clear of the CTA bar (scroll margin = bar + 16px); tokens only', () => {
    const { root } = setup();
    expect(root.querySelector('button[aria-label="Back"]')).not.toBeNull();
    expect(declared('.nm-back:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    const column = root.querySelector('.nm-wizard-frame') as HTMLElement;
    expect(column.style.getPropertyValue('--nm-cta-scroll-margin')).toBe('16px');
    expect(tokensOnly()).toBe(true);
  });
});
