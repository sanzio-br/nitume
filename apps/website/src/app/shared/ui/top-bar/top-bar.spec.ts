import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NmTopBar } from './top-bar.component';

@Component({
  imports: [NmTopBar],
  template: `
    <nm-top-bar [title]="title()" [greeting]="greeting()">
      @if (action()) {
        <button type="button" aria-label="Notifications">N</button>
      }
    </nm-top-bar>
  `,
})
class Host {
  readonly title = signal<string | null>('Home');
  readonly greeting = signal<string | null>(null);
  readonly action = signal(false);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { host: fixture.componentInstance, root, update: () => fixture.detectChanges() };
}

describe('nm-top-bar (#6)', () => {
  it('renders the title as a top-bar-title h1 with padding 8 20 14 on slate', () => {
    const { root } = setup();
    const h1 = root.querySelector('h1') as HTMLElement;
    expect(h1.textContent).toBe('Home');
    expect(getComputedStyle(h1).fontSize).toBe('21px');
    expect(getComputedStyle(h1).fontWeight).toBe('700');
    expect(getComputedStyle(h1).color).toBe('var(--nitume-blue)');
    const bar = root.querySelector('.nm-top-bar') as HTMLElement;
    expect(getComputedStyle(bar).padding).toBe('8px 20px 14px');
    expect(getComputedStyle(bar).backgroundColor).toBe('var(--nitume-slate)');
  });

  it('greeting above the title in the greeting style; empty title renders no heading', () => {
    const { host, root, update } = setup();
    host.greeting.set('Good morning');
    update();
    const g = root.querySelector('.nm-top-bar__greeting') as HTMLElement;
    expect(g.textContent).toBe('Good morning');
    expect(getComputedStyle(g).fontSize).toBe('12px');
    expect(getComputedStyle(g).color).toBe('var(--nitume-slate-600)');
    host.title.set('');
    update();
    expect(root.querySelector('h1')).toBeNull();
  });

  it('trailing actions slot with a 10px gap keeps the action accessible name', () => {
    const { host, root, update } = setup();
    host.action.set(true);
    update();
    const actions = root.querySelector('.nm-top-bar__actions') as HTMLElement;
    expect(actions.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications');
    expect(getComputedStyle(actions).gap).toBe('10px');
  });
});
