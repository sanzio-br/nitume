import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { accessibleText, cssRuleValues, declared } from '../../../../testing/css';
import { NmButton, NmButtonVariant } from './button.component';

@Component({
  imports: [NmButton],
  template: `
    <nm-button
      [variant]="variant()"
      [size]="size()"
      [destructive]="destructive()"
      [disabled]="disabled()"
      [loading]="loading()"
      [href]="href()"
      (pressed)="presses = presses + 1"
      >Request quote</nm-button
    >
  `,
})
class Host {
  readonly variant = signal<NmButtonVariant>('primary');
  readonly size = signal<'regular' | 'small'>('regular');
  readonly destructive = signal(false);
  readonly disabled = signal(false);
  readonly loading = signal(false);
  readonly href = signal<string | null>(null);
  presses = 0;
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  const control = () =>
    fixture.nativeElement.querySelector('nm-button > button, nm-button > a') as HTMLElement;
  const update = () => fixture.detectChanges();
  return { fixture, host, control, update };
}

describe('nm-button (§12.2)', () => {
  it('4. renders each variant with its token pairing', () => {
    const { host, control, update } = setup();
    const expected: Record<NmButtonVariant, { bg: string; fg: string; border?: string }> = {
      primary: { bg: 'var(--nitume-green)', fg: 'var(--nitume-white)' },
      secondary: { bg: 'var(--nitume-blue)', fg: 'var(--nitume-white)' },
      outline: {
        bg: 'var(--nitume-white)',
        fg: 'var(--nitume-blue)',
        border: 'var(--nitume-slate-line)',
      },
      text: { bg: '', fg: 'var(--nitume-blue)' },
      link: { bg: '', fg: 'var(--nitume-green-700)' },
    };
    for (const [variant, want] of Object.entries(expected) as [NmButtonVariant, typeof expected.primary][]) {
      host.variant.set(variant);
      update();
      const cs = getComputedStyle(control());
      if (want.bg) expect.soft(cs.backgroundColor, `${variant} fill`).toBe(want.bg);
      else expect.soft(cs.backgroundColor, `${variant} has no fill`).not.toMatch(/var\(/);
      expect.soft(cs.color, `${variant} label`).toBe(want.fg);
      if (want.border) {
        expect.soft(declared(`.nm-btn--${variant}`, 'border-color'), `${variant} border`).toEqual([want.border]);
      }
      expect(control().classList).toContain(`nm-btn--${variant}`);
      expect(control().tagName).toBe('BUTTON');
      expect(control().getAttribute('type')).toBe('button');
    }
    // No shadow and a pill radius on every variant.
    expect(getComputedStyle(control()).borderRadius).toBe('var(--nitume-r-pill)');
  });

  it('5. destructive makes outline and text labels red; ignored with a dev warning on fills', () => {
    const { host, control, update } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    host.destructive.set(true);

    for (const variant of ['outline', 'text'] as const) {
      host.variant.set(variant);
      update();
      expect(getComputedStyle(control()).color).toBe('var(--nitume-red)');
    }
    expect(warn).not.toHaveBeenCalled();

    for (const variant of ['primary', 'secondary'] as const) {
      host.variant.set(variant);
      update();
      expect(control().classList).not.toContain('nm-btn--destructive');
      expect(getComputedStyle(control()).color).toBe('var(--nitume-white)');
      expect(getComputedStyle(control()).backgroundColor).not.toContain('red');
    }
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain('ignored on the primary variant');
    warn.mockRestore();
  });

  it('6. small size applies the small type style and keeps a 48px hit area', () => {
    const { host, control, update } = setup();
    host.size.set('small');
    update();
    const cs = getComputedStyle(control());
    expect(cs.fontSize).toBe('12.5px');
    expect(cs.fontWeight).toBe('700');
    expect(cs.paddingTop).toBe('9px');
    expect(cs.paddingLeft).toBe('16px');
    expect(cs.position).toBe('relative');
    // nm-hit-area: absolutely positioned ::before at least 48×48.
    expect(cssRuleValues(['.nm-btn--small', '::before'], 'width')).toContain(
      'max(100%, var(--nitume-tap))',
    );
    expect(cssRuleValues(['.nm-btn--small', '::before'], 'height')).toContain(
      'max(100%, var(--nitume-tap))',
    );
    expect(cssRuleValues(['.nm-btn--small', '::before'], 'position')).toContain('absolute');
    // Regular keeps min-height 48.
    host.size.set('regular');
    update();
    expect(getComputedStyle(control()).minHeight).toBe('var(--nitume-tap)');
  });

  it('7. disabled: disabled attribute, no output, slate-line fill and slate-400 label', () => {
    const { fixture, host, control, update } = setup();
    host.disabled.set(true);
    update();
    const button = control() as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fixture.componentInstance.presses).toBe(0);
    const cs = getComputedStyle(button);
    expect(cs.backgroundColor).toBe('var(--nitume-slate-line)');
    expect(cs.color).toBe('var(--nitume-slate-400)');
    expect(cs.cursor).toBe('not-allowed');

    host.variant.set('outline');
    update();
    expect(getComputedStyle(control()).color).toBe('var(--nitume-slate-400)');
    expect(declared('.nm-btn--outline.nm-btn--disabled', 'border-color')).toEqual([
      'var(--nitume-slate-line)',
    ]);
  });

  it('8. loading: spinner, aria-busy, accessible name still the label, clicks ignored, width kept', () => {
    const { fixture, host, control, update } = setup();
    host.loading.set(true);
    update();
    const button = control();
    expect(button.querySelector('.nm-btn__spinner')).not.toBeNull();
    expect(button.querySelector('.nm-btn__spinner')?.getAttribute('aria-hidden')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(accessibleText(button)).toBe('Request quote');
    // The label stays in the layout (opacity only), so the width is unchanged.
    const content = button.querySelector('.nm-btn__content') as HTMLElement;
    expect(getComputedStyle(content).opacity).toBe('0');
    expect(getComputedStyle(content).display).not.toBe('none');
    expect(getComputedStyle(content).visibility).not.toBe('hidden');
    button.click();
    expect(fixture.componentInstance.presses).toBe(0);

    host.loading.set(false);
    update();
    control().click();
    expect(fixture.componentInstance.presses).toBe(1);
    expect(control().hasAttribute('aria-busy')).toBe(false);
  });

  it('9. href renders an anchor with the same classes', () => {
    const { host, control, update } = setup();
    host.variant.set('outline');
    update();
    const buttonClasses = control().className;
    host.href.set('/app/customer/tasks');
    update();
    const anchor = control();
    expect(anchor.tagName).toBe('A');
    expect(anchor.getAttribute('href')).toBe('/app/customer/tasks');
    expect([...anchor.classList].sort()).toEqual(buttonClasses.split(' ').sort());
    expect(getComputedStyle(anchor).backgroundColor).toBe('var(--nitume-white)');
    expect(getComputedStyle(anchor).color).toBe('var(--nitume-blue)');

    host.disabled.set(true);
    update();
    expect(control().hasAttribute('href')).toBe(false);
    expect(control().getAttribute('aria-disabled')).toBe('true');
  });
});
