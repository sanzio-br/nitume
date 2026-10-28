// `nm-icon` (auth-foundation §7.2): inline SVG from a typed registry,
// `fill="currentColor"` (colour from the parent's token), always hidden
// from assistive technology (the label next to it names the control).
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NM_ICONS, NmIconName } from './icons';

@Component({
  selector: 'nm-icon',
  template: `
    <svg
      class="nm-icon__svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      focusable="false"
      aria-hidden="true"
      [attr.width]="size()"
      [attr.height]="size()"
    >
      <path [attr.d]="path()" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'nm-icon', 'aria-hidden': 'true', '[attr.data-icon]': 'name()' },
})
export class NmIcon {
  readonly name = input.required<NmIconName>();
  /** Edge in px (Flutter tab bar icon 21). */
  readonly size = input(21);

  protected readonly path = computed(() => NM_ICONS[this.name()]);
}
