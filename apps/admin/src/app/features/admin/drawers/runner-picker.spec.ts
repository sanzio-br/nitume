import { TestBed } from '@angular/core/testing';
import type { ErrandCandidate } from '../../../core/api-types';
import { candidateCaption, candidateName, RunnerPickerComponent } from './runner-picker';

function candidate(id: string, patch: Partial<ErrandCandidate> = {}): ErrandCandidate {
  return {
    runnerProfileId: `rrrrrrrr-0000-0000-0000-00000000${id}`,
    displayName: `Runner ${id}`,
    rating: '4.90',
    tasksCompleted: 137,
    availability: 'online',
    offline: false,
    tried: null,
    ineligibleReason: null,
    distanceKm: 2.43,
    purchaseLimit: '3000.00',
    ...patch,
  };
}

const online = candidate('aaaa');
const offlineA = candidate('bbbb', {
  availability: 'offline',
  offline: true,
  displayName: 'Achieng',
});
const offlineB = candidate('cccc', { availability: 'offline', offline: true, displayName: null });
const tried = candidate('dddd', { tried: 'declined' });
const overLimit = candidate('eeee', { ineligibleReason: 'over_purchase_limit' });

describe('candidate labels', () => {
  it('names the runner, else a masked id', () => {
    expect(candidateName(online)).toBe('Runner aaaa');
    expect(candidateName(offlineB)).toBe('Runner …cccc');
  });

  it('captions rating, tasks and distance', () => {
    expect(candidateCaption(online)).toBe('4.9 · 137 tasks · 2.4 km');
    expect(candidateCaption(candidate('ffff', { tasksCompleted: 1, distanceKm: null }))).toBe(
      '4.9 · 1 task',
    );
  });
});

describe('RunnerPickerComponent (rows 215, 228)', () => {
  function create(items: ErrandCandidate[], offlineCount: number, selected = '') {
    const fixture = TestBed.createComponent(RunnerPickerComponent);
    fixture.componentRef.setInput('candidates', items);
    fixture.componentRef.setInput('offlineCount', offlineCount);
    fixture.componentRef.setInput('selected', selected);
    const picked: string[] = [];
    fixture.componentInstance.selectedChange.subscribe((id) => picked.push(id));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, picked };
  }

  const toggle = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Show offline runners'),
    ) as HTMLButtonElement | undefined;

  it('lists online runners and collapses the offline ones behind Show offline runners (n)', () => {
    const { el } = create([online, offlineA, offlineB, tried, overLimit], 2);
    const radios = el.querySelectorAll('input[type="radio"]');
    expect(radios).toHaveLength(1);
    expect(el.textContent).toContain('Runner aaaa');
    expect(el.textContent).not.toContain('Achieng');
    const btn = toggle(el);
    expect(btn?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Show offline runners (2)');
    expect(btn?.querySelector('.num')?.textContent).toBe('2');
    expect(btn?.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands the offline group as selectable runners with an Offline chip', () => {
    const { fixture, el, picked } = create([online, offlineA, offlineB], 2);
    toggle(el)?.click();
    fixture.detectChanges();
    expect(toggle(el)?.getAttribute('aria-expanded')).toBe('true');
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios[1].getAttribute('aria-label')).toBe('Achieng, offline');
    const chips = Array.from(el.querySelectorAll('.chip')).map((c) => c.textContent?.trim());
    expect(chips).toEqual(['Offline', 'Offline']);
    radios[1].click();
    expect(picked).toEqual([offlineA.runnerProfileId]);
  });

  it('says a picked offline runner accepts once online', () => {
    const { fixture, el } = create([online, offlineA], 1, offlineA.runnerProfileId);
    toggle(el)?.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Achieng is offline. They can accept once they go online.');
  });

  it('shows the empty line when no online runner is eligible, keeping offline runners', () => {
    const { el } = create([offlineA, tried], 1);
    expect(el.textContent).toContain('No eligible runners are available right now.');
    expect(toggle(el)).toBeDefined();
  });

  it('has no offline toggle without offline runners', () => {
    const { el } = create([online], 0);
    expect(toggle(el)).toBeUndefined();
  });
});
