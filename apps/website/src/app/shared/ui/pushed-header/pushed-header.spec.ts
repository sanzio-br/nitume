import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { declared } from '../../../../testing/css';
import { NmBackEvent } from '../back-button/back-button.component';
import { NmPushedHeader } from './pushed-header.component';

@Component({
  imports: [NmPushedHeader],
  template: `
    <nm-pushed-header [title]="title()" [step]="step()" [steps]="steps()" (back)="onBack($event)">
      @if (trailing()) {
        <button nmPushedTrailing type="button">Skip</button>
      }
    </nm-pushed-header>
  `,
})
class Host {
  readonly title = signal<string | null>(null);
  readonly step = signal<number | null>(null);
  readonly steps = signal<number | null>(null);
  readonly trailing = signal(false);
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
  return { host: fixture.componentInstance, root, update: () => fixture.detectChanges() };
}

describe('nm-pushed-header (#6)', () => {
  it('renders the back button only (no heading) by default, row 56px, padding 2 20 6 12 on slate', () => {
    const { root } = setup();
    const row = root.querySelector('.nm-pushed-header') as HTMLElement;
    expect(row.querySelector('h1')).toBeNull();
    expect(row.querySelector('button[aria-label="Back"]')).not.toBeNull();
    const cs = getComputedStyle(row);
    expect(cs.height).toBe('56px');
    expect(cs.paddingTop).toBe('2px');
    expect(cs.paddingRight).toBe('20px');
    expect(cs.paddingBottom).toBe('6px');
    expect(cs.paddingLeft).toBe('12px');
    expect(cs.backgroundColor).toBe('var(--nitume-slate)');
  });

  it('title renders a pushed-title h1; Step n of m in Fira Code num-meta; trailing slot', () => {
    const { host, root, update } = setup();
    host.title.set('Pick a category');
    host.step.set(1);
    host.steps.set(3);
    host.trailing.set(true);
    update();
    const h1 = root.querySelector('h1') as HTMLElement;
    expect(h1.textContent).toBe('Pick a category');
    expect(getComputedStyle(h1).fontSize).toBe('18px');
    expect(getComputedStyle(h1).fontWeight).toBe('700');
    expect(getComputedStyle(h1).color).toBe('var(--nitume-blue)');
    const step = root.querySelector('.nm-pushed-header__step') as HTMLElement;
    expect(step.textContent?.trim()).toBe('Step 1 of 3');
    expect(getComputedStyle(step).fontFamily).toBe('var(--nitume-font-num)');
    expect(getComputedStyle(step).fontSize).toBe('11px');
    expect(root.querySelector('[nmPushedTrailing]')?.textContent).toBe('Skip');
  });

  it('back is re-emitted from the back button (accessible name Back, focus ring)', () => {
    const { host, root } = setup();
    (root.querySelector('button[aria-label="Back"]') as HTMLButtonElement).click();
    expect(host.backs).toHaveLength(1);
    expect(declared('.nm-back:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
  });
});
