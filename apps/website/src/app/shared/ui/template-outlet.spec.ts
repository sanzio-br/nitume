import { Component, TemplateRef, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NmTemplateOutlet } from './template-outlet.directive';

@Component({
  imports: [NmTemplateOutlet],
  template: `
    <ng-template #a><span class="a">A</span></ng-template>
    <ng-template #b><span class="b">B</span></ng-template>
    @if (which(); as w) {
      <ng-container [nmTemplateOutlet]="w === 'a' ? a : b" />
    }
  `,
})
class Host {
  readonly which = signal<'a' | 'b'>('a');
  readonly a = viewChild.required<TemplateRef<unknown>>('a');
}

describe('nmTemplateOutlet (#6)', () => {
  it('renders the given template and swaps it when the input changes', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.a')?.textContent).toBe('A');
    fixture.componentInstance.which.set('b');
    fixture.detectChanges();
    expect(root.querySelector('.a')).toBeNull();
    expect(root.querySelector('.b')?.textContent).toBe('B');
  });
});
