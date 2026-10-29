// `nm-list-item` (ui-kit spec §4.3.2; design-system `.list-item`, Flutter
// NitumeListItem). Leading checkbox, title, Fira Code meta, `3/5` counter.
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NmNum } from '../../format/num.directive';
import { formatCounter } from '../../format/formatters';
import { NmCheckbox } from './checkbox.component';

export type NmListProgress = { readonly done: number; readonly total: number } | string;

@Component({
  selector: 'nm-list-item',
  imports: [NgTemplateOutlet, NmCheckbox, NmNum],
  templateUrl: './list-item.component.html',
  styleUrl: './list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'listitem',
    '[attr.aria-label]': 'clickable() ? null : accessibleName()',
  },
})
export class NmListItem {
  readonly title = input.required<string>();
  readonly meta = input<string | null>(null);
  readonly progress = input<NmListProgress | null>(null);
  readonly done = input(false);
  /** Whole row is a button that emits `activated`. */
  readonly clickable = input(false);
  /** The leading checkbox is interactive and emits `checkedChange`. */
  readonly checkable = input(false);

  readonly activated = output<void>();
  readonly checkedChange = output<boolean>();

  /** `{done, total}` from the input, or parsed from a `3/5` string. */
  private readonly counts = computed(() => {
    const p = this.progress();
    if (p === null) return null;
    if (typeof p !== 'string') return p;
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(p.trim());
    return m ? { done: Number(m[1]), total: Number(m[2]) } : null;
  });

  protected readonly progressText = computed(() => {
    const p = this.progress();
    if (p === null) return null;
    return typeof p === 'string' ? p : formatCounter(p.done, p.total);
  });

  protected readonly complete = computed(() => {
    const c = this.counts();
    return c !== null && c.total > 0 && c.done === c.total;
  });

  /** `title, meta, 3 of 5, completed`. */
  readonly accessibleName = computed(() => {
    const c = this.counts();
    const parts = [
      this.title(),
      this.meta(),
      c ? `${c.done} of ${c.total}` : this.progressText(),
      this.done() ? 'completed' : null,
    ];
    return parts.filter((p): p is string => !!p).join(', ');
  });

  protected onChecked(value: boolean): void {
    this.checkedChange.emit(value);
  }
}
