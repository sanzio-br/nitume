import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { declared } from '../../../../testing/css';
import { NmBackButton, NmBackEvent } from './back-button.component';

@Component({
  imports: [NmBackButton],
  template: `<nm-back-button [fallback]="fallback()" (back)="onBack($event)" />`,
})
class Host {
  readonly fallback = signal<string | null>('/app/customer/sign-in');
  handle = false;
  readonly events: NmBackEvent[] = [];
  onBack(event: NmBackEvent) {
    this.events.push(event);
    if (this.handle) event.preventDefault();
  }
}

@Component({ template: '' })
class Blank {}

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'app/a', component: Blank },
        { path: 'app/b', component: Host },
        { path: 'outside', component: Blank },
      ]),
    ],
  });
  const harness = await RouterTestingHarness.create();
  return harness;
}

describe('nm-back-button (#6)', () => {
  it('renders a 48×48 button named Back with a 32px white circle, slate-line border and blue 16px arrow', async () => {
    const harness = await setup();
    await harness.navigateByUrl('/app/b');
    const button = harness.routeNativeElement!.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Back');
    expect(button.getAttribute('type')).toBe('button');
    expect(getComputedStyle(button).width).toBe('var(--nitume-tap)');
    expect(getComputedStyle(button).height).toBe('var(--nitume-tap)');
    expect(getComputedStyle(button).color).toBe('var(--nitume-blue)');
    const circle = button.querySelector('.nm-back__circle') as HTMLElement;
    expect(getComputedStyle(circle).width).toBe('32px');
    expect(getComputedStyle(circle).backgroundColor).toBe('var(--nitume-white)');
    expect(declared('.nm-back__circle', 'border')).toEqual(['1px solid var(--nitume-slate-line)']);
    expect(declared('.nm-back:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
    expect(button.querySelector('nm-icon')?.getAttribute('data-icon')).toBe('arrow-back');
    expect(button.querySelector('svg')?.getAttribute('width')).toBe('16');
  });

  it('emits back; a listener that calls preventDefault() handles it alone', async () => {
    const harness = await setup();
    const host = await harness.navigateByUrl('/app/b', Host);
    host.handle = true;
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigateByUrl');
    const back = vi.spyOn(TestBed.inject(Location), 'back');
    (harness.routeNativeElement!.querySelector('button') as HTMLButtonElement).click();
    expect(host.events).toHaveLength(1);
    expect(nav).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it('default: history back when the previous page is inside /app, else the fallback URL', async () => {
    const harness = await setup();
    await harness.navigateByUrl('/app/a');
    await harness.navigateByUrl('/app/b', Host);
    const back = vi.spyOn(TestBed.inject(Location), 'back').mockImplementation(() => undefined);
    (harness.routeNativeElement!.querySelector('button') as HTMLButtonElement).click();
    expect(back).toHaveBeenCalledTimes(1);

    await harness.navigateByUrl('/outside');
    await harness.navigateByUrl('/app/b', Host);
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    (harness.routeNativeElement!.querySelector('button') as HTMLButtonElement).click();
    expect(nav).toHaveBeenCalledWith('/app/customer/sign-in');
    expect(back).toHaveBeenCalledTimes(1);
  });
});
