// Issue #6 additions to nm-button: external-link attributes and the inline
// link used inside the legal line (customer-v-auth-phone §Components).
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared } from '../../../../testing/css';
import { NmButton } from './button.component';

@Component({
  imports: [NmButton],
  template: `
    <nm-button
      variant="link"
      size="small"
      [href]="href()"
      [target]="target()"
      [rel]="rel()"
      [ariaLabel]="ariaLabel()"
      [inline]="inline()"
      >Terms</nm-button
    >
  `,
})
class Host {
  readonly href = signal<string | null>('https://nitume.test/terms');
  readonly target = signal<string | null>(null);
  readonly rel = signal<string | null>(null);
  readonly ariaLabel = signal<string | null>(null);
  readonly inline = signal(false);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { host: fixture.componentInstance, root, update: () => fixture.detectChanges() };
}

describe('nm-button #6 link attributes', () => {
  it('defaults add no target, rel or aria-label', () => {
    const { root } = setup();
    const a = root.querySelector('a') as HTMLAnchorElement;
    expect(a.hasAttribute('target')).toBe(false);
    expect(a.hasAttribute('rel')).toBe(false);
    expect(a.hasAttribute('aria-label')).toBe(false);
    expect(a.classList.contains('nm-btn--inline')).toBe(false);
  });

  it('target, rel and ariaLabel are bound on the anchor', () => {
    const { host, root, update } = setup();
    host.target.set('_blank');
    host.rel.set('noopener noreferrer');
    host.ariaLabel.set('Terms (opens in a new tab)');
    update();
    const a = root.querySelector('a') as HTMLAnchorElement;
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('aria-label')).toBe('Terms (opens in a new tab)');
  });

  it('inline link collapses to the text and keeps the 48px hit area and focus ring', () => {
    const { host, root, update } = setup();
    host.inline.set(true);
    update();
    const a = root.querySelector('a') as HTMLAnchorElement;
    expect(a.classList.contains('nm-btn--inline')).toBe(true);
    expect(a.classList.contains('nm-btn--small')).toBe(true);
    expect(declared('.nm-btn--link.nm-btn--inline', 'min-height')).toEqual(['0px']);
    expect(declared('.nm-btn--link.nm-btn--inline', 'padding')).toEqual(['0px']);
    expect(declared('.nm-btn--small::before', 'height')).toEqual(['max(100%, var(--nitume-tap))']);
    expect(declared('.nm-btn:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    expect(getComputedStyle(a).color).toBe('var(--nitume-green-700)');
  });
});
