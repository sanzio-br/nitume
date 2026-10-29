import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NmFieldValue } from './field-value.directive';
import { NmField } from './field.component';

@Component({
  imports: [NmField, NmFieldValue],
  template: `<nm-field label="Your name" [nmFieldValue]="initial" (nmFieldValueChange)="values.push($event)" />`,
})
class Host {
  readonly initial = 'Achieng';
  readonly values: string[] = [];
  readonly unused = signal(0);
}

describe('nmFieldValue (#6)', () => {
  it('writes the initial value into nm-field and emits each typed value, without @angular/forms directives', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Achieng');
    input.value = 'Achieng Otieno';
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.values).toEqual(['Achieng Otieno']);
    expect(input.labels?.[0]?.textContent).toBe('Your name');
  });
});
