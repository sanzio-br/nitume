import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared } from '../../../../testing/css';
import { NmLegalLine } from './legal-line.component';

@Component({
  imports: [NmLegalLine],
  template: `<nm-legal-line [termsLabel]="label()" [termsUrl]="terms()" [privacyUrl]="privacy()" />`,
})
class Host {
  readonly label = signal('Terms');
  readonly terms = signal<string | null>('https://nitume.test/terms');
  readonly privacy = signal<string | null>('https://nitume.test/privacy');
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const text = () => (root.querySelector('.nm-legal') as HTMLElement).textContent?.replace(/\s+/g, ' ').trim();
  return { host: fixture.componentInstance, root, text, update: () => fixture.detectChanges() };
}

describe('nm-legal-line (#6)', () => {
  it('renders the exact sentence in the resend style', () => {
    const { root, text } = setup();
    expect(text()).toBe("By continuing you agree to Nitume's Terms & Privacy Policy.");
    const p = root.querySelector('.nm-legal') as HTMLElement;
    expect(getComputedStyle(p).fontSize).toBe('12.5px');
    expect(getComputedStyle(p).fontWeight).toBe('400');
    expect(getComputedStyle(p).color).toBe('var(--nitume-slate-600)');
  });

  it('configured URLs: two links opening a new tab, named with the new-tab suffix, focus ring', () => {
    const { root } = setup();
    const links = Array.from(root.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://nitume.test/terms',
      'https://nitume.test/privacy',
    ]);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.classList.contains('nm-btn--small')).toBe(true);
    }
    expect(links[0].getAttribute('aria-label')).toBe('Terms (opens in a new tab)');
    expect(links[1].getAttribute('aria-label')).toBe('Privacy Policy (opens in a new tab)');
    expect(declared('.nm-btn:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
  });

  it('empty or unsafe URLs render plain text; mailto and tel are allowed; Runner Terms label', () => {
    const { host, root, text, update } = setup();
    host.terms.set('');
    host.privacy.set('javascript:alert(1)');
    update();
    expect(root.querySelectorAll('a')).toHaveLength(0);
    expect(text()).toBe("By continuing you agree to Nitume's Terms & Privacy Policy.");
    host.label.set('Runner Terms');
    host.terms.set('mailto:legal@nitume.test');
    host.privacy.set('tel:+254700000000');
    update();
    expect(text()).toBe("By continuing you agree to Nitume's Runner Terms & Privacy Policy.");
    expect(Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      'mailto:legal@nitume.test',
      'tel:+254700000000',
    ]);
  });
});
