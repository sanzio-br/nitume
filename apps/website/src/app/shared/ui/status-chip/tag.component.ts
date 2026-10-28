// `nm-tag` (ui-kit spec §4.2.2; Flutter NitumeTag R-14). Display only:
// blue on blue-050, no dot, never green, not focusable.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'nm-tag',
  template: `<span class="nm-tag">{{ label() }}</span>`,
  styleUrl: './tag.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmTag {
  readonly label = input.required<string>();
}
