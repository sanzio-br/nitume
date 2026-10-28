// `nm-card` (ui-kit spec §4.4; design-system `.card-demo`, Flutter
// NitumeCard C-07). White, slate-line border, r-m, padding 16. No shadow.
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'nm-card',
  imports: [NgTemplateOutlet],
  template: `
    <ng-template #content><ng-content /></ng-template>
    @if (clickable()) {
      @if (href(); as link) {
        <a [class]="classes()" [style.padding]="padding()" [attr.href]="link" [attr.aria-label]="label()"
          ><ng-container [ngTemplateOutlet]="content"
        /></a>
      } @else {
        <button
          type="button"
          [class]="classes()"
          [style.padding]="padding()"
          [attr.aria-label]="label()"
          (click)="activated.emit()"
        >
          <ng-container [ngTemplateOutlet]="content" />
        </button>
      }
    } @else {
      <div [class]="classes()" [style.padding]="padding()">
        <ng-container [ngTemplateOutlet]="content" />
      </div>
    }
  `,
  styleUrl: './card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmCard {
  /** View-specific padding; default 16px. */
  readonly padding = input('16px');
  readonly border = input<'solid' | 'dashed'>('solid');
  /** Dashed variants: receipt 1px, capture drop zone 2px. */
  readonly dashedWidth = input<1 | 2>(1);
  /** Renders a button (or an anchor with `href`) with a focus ring. */
  readonly clickable = input(false);
  readonly href = input<string | null>(null);
  /** Accessible name of a clickable card. */
  readonly label = input<string | null>(null);

  readonly activated = output<void>();

  protected readonly classes = computed(() => {
    const out = ['nm-card'];
    if (this.border() === 'dashed') {
      out.push(this.dashedWidth() === 2 ? 'nm-card--dashed-2' : 'nm-card--dashed');
    }
    if (this.clickable()) out.push('nm-card--clickable');
    return out.join(' ');
  });
}
