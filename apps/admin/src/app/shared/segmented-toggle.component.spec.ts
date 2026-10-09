import { TestBed } from '@angular/core/testing';
import { SegmentedToggleComponent } from './segmented-toggle.component';

describe('SegmentedToggleComponent (A-09)', () => {
  function render(value = 'till') {
    const fixture = TestBed.createComponent(SegmentedToggleComponent);
    fixture.componentRef.setInput('options', [
      { value: 'till', label: 'Till (Buy Goods)' },
      { value: 'paybill', label: 'Paybill' },
    ]);
    fixture.componentRef.setInput('ariaLabel', 'Pay with');
    fixture.componentRef.setInput('value', value);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    return fixture;
  }
  const radios = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];

  it('is a labelled radiogroup with one checked option and roving tabindex', () => {
    const fixture = render();
    const group = fixture.nativeElement.querySelector('[role="radiogroup"]');
    expect(group.getAttribute('aria-label')).toBe('Pay with');
    const [till, paybill] = radios(fixture.nativeElement);
    expect(till.getAttribute('aria-checked')).toBe('true');
    expect(till.classList).toContain('active');
    expect(till.tabIndex).toBe(0);
    expect(paybill.tabIndex).toBe(-1);
  });

  it('moves and selects with the arrow keys, wrapping around', () => {
    const fixture = render();
    const [till] = radios(fixture.nativeElement);
    till.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe('paybill');
    expect(document.activeElement).toBe(radios(fixture.nativeElement)[1]);
    radios(fixture.nativeElement)[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe('till');
  });

  it('selects on click', () => {
    const fixture = render();
    radios(fixture.nativeElement)[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe('paybill');
    expect(radios(fixture.nativeElement)[1].getAttribute('aria-checked')).toBe('true');
  });
});
