// `nm-form-card` (ui-kit spec §4.5; Flutter NitumeFormCard): an `nm-card`
// with a `card-label` heading above one control.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NmCard } from '../card/card.component';

@Component({
  selector: 'nm-form-card',
  imports: [NmCard],
  template: `
    <nm-card [padding]="padding()">
      <div class="nm-form-card__label" role="heading" [attr.aria-level]="level()">{{ label() }}</div>
      <ng-content />
    </nm-card>
  `,
  styleUrl: './form-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmFormCard {
  readonly label = input.required<string>();
  readonly level = input(2);
  readonly padding = input('16px');
}
