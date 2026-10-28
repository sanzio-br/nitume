// `nm-button` (ui-kit spec §4.1; Flutter NitumeButton C-01…C-04).
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  isDevMode,
  output,
} from '@angular/core';

export type NmButtonVariant = 'primary' | 'secondary' | 'outline' | 'text' | 'link';
export type NmButtonSize = 'regular' | 'small';

@Component({
  selector: 'nm-button',
  imports: [NgTemplateOutlet],
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.nm-button--expand]': 'expand()',
  },
})
export class NmButton {
  readonly variant = input<NmButtonVariant>('primary');
  readonly size = input<NmButtonSize>('regular');
  /** Red label on outline and text only; ignored on fills (no red fill). */
  readonly destructive = input(false);
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly expand = input(false);
  readonly type = input<'button' | 'submit'>('button');
  /** Renders an `<a>` with the same look, for navigation. */
  readonly href = input<string | null>(null);

  /** Activation (click, Enter, Space). Not emitted while disabled or loading. */
  readonly pressed = output<MouseEvent>();

  protected readonly isFill = computed(() => {
    const v = this.variant();
    return v === 'primary' || v === 'secondary';
  });

  protected readonly classes = computed(() => {
    const out = ['nm-btn', `nm-btn--${this.variant()}`, `nm-btn--${this.size()}`];
    if (this.destructive() && !this.isFill() && this.variant() !== 'link') {
      out.push('nm-btn--destructive');
    }
    if (this.disabled()) out.push('nm-btn--disabled');
    if (this.loading()) out.push('nm-btn--loading');
    return out.join(' ');
  });

  constructor() {
    effect(() => {
      if (this.destructive() && this.isFill() && isDevMode()) {
        console.warn(
          `nm-button: "destructive" is ignored on the ${this.variant()} variant. ` +
            'Use the outline or text variant for a destructive action (no red fill).',
        );
      }
    });
  }

  protected onClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.pressed.emit(event);
  }
}
