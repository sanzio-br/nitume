import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared, rawStyles } from '../../../../testing/css';
import { stubViewport } from '../../../../testing/media';
import { NmAuthFrame } from './auth-frame.component';

@Component({
  imports: [NmAuthFrame],
  template: `
    <nm-auth-frame heading="Enter the code">
      <button nmAuthHeader type="button" aria-label="Back">B</button>
      <span nmAuthSub>We sent a code.</span>
      <form id="body"></form>
    </nm-auth-frame>
  `,
})
class Host {}

function render(width: number) {
  const restore = stubViewport(width);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  restore();
  return fixture.nativeElement as HTMLElement;
}

describe('nm-auth-frame (#6)', () => {
  it('renders a full-viewport slate page with safe-area padding and the heading block', () => {
    const root = render(360);
    const frame = root.querySelector('.nm-auth-frame') as HTMLElement;
    expect(getComputedStyle(frame).backgroundColor).toBe('var(--nitume-slate)');
    expect(getComputedStyle(frame).minHeight).toBe('100dvh');
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(rawStyles()).toContain(`padding-${side}:env(safe-area-inset-${side})`);
    }
    const h1 = root.querySelector('h1') as HTMLElement;
    expect(h1.textContent).toBe('Enter the code');
    expect(getComputedStyle(h1).fontSize).toBe('22px');
    expect(getComputedStyle(h1).color).toBe('var(--nitume-blue)');
    const sub = root.querySelector('.nm-auth-frame__sub') as HTMLElement;
    expect(sub.textContent).toBe('We sent a code.');
    expect(getComputedStyle(sub).fontSize).toBe('13px');
    expect(getComputedStyle(sub).color).toBe('var(--nitume-slate-600)');
    expect(getComputedStyle(sub).marginTop).toBe('8px');
    expect(getComputedStyle(sub).marginBottom).toBe('26px');
    expect(root.querySelector('.nm-auth-frame__column #body')).not.toBeNull();
  });

  it('below 768px: header at the top of the viewport, column max 400px with 28px padding, no card', () => {
    const root = render(360);
    const frame = root.querySelector('.nm-auth-frame') as HTMLElement;
    expect(frame.classList.contains('nm-auth-frame--wide')).toBe(false);
    const header = root.querySelector('.nm-auth-frame__header') as HTMLElement;
    expect(header.querySelector('[aria-label="Back"]')).not.toBeNull();
    expect(getComputedStyle(header).marginBottom).not.toBe('16px');
    const column = root.querySelector('.nm-auth-frame__column') as HTMLElement;
    expect(getComputedStyle(column).maxWidth).toBe('400px');
    expect(getComputedStyle(column).padding).toBe('28px');
    expect(getComputedStyle(column).justifyContent).toBe('center');
    expect(declared('.nm-auth-frame__column', 'border')).toEqual([]);
    expect(declared('.nm-auth-frame__column', 'background-color')).toEqual([]);
  });

  it('from 768px: header inside the 400px column, 16px above the heading', () => {
    const root = render(1024);
    const frame = root.querySelector('.nm-auth-frame') as HTMLElement;
    expect(frame.classList.contains('nm-auth-frame--wide')).toBe(true);
    const inner = root.querySelector('.nm-auth-frame__inner') as HTMLElement;
    expect(getComputedStyle(inner).maxWidth).toBe('400px');
    expect(getComputedStyle(inner).padding).toBe('28px');
    const header = root.querySelector('.nm-auth-frame__header') as HTMLElement;
    expect(getComputedStyle(header).marginBottom).toBe('16px');
    expect(header.nextElementSibling?.classList.contains('nm-auth-frame__column')).toBe(true);
  });

  it('header focus ring and tokens: projected controls keep their own names; only custom properties used', () => {
    const root = render(360);
    expect(root.querySelector('[nmAuthHeader]')?.getAttribute('aria-label')).toBe('Back');
    for (const prop of ['background-color']) {
      for (const v of declared('.nm-auth-frame', prop)) expect(v).toMatch(/^var\(--nitume-/);
    }
  });
});
