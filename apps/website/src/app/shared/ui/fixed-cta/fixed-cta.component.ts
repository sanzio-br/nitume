// `nm-fixed-cta` (customer-v-new-category §W4; port of FixedCta /
// NitumeFixedCta, specified in customer-x-awaiting-quote.md §Components and
// built once here; #8 reuses it). Below 768px: fixed to the bottom of the
// viewport on slate, padding 8 20 6 + the safe-area inset, with an in-flow
// spacer of the bar's height so nothing hides under it. From 768px: inline
// where the view places it, 16px below the last card. Optional
// `[nmCtaAbove]` content sits 10px above the button. No shadow.
//
// Toasts shown above the bar read `NmFixedCtaOffset.toastOffset()` (K§4.10).
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injectable,
  inject,
  output,
  signal,
} from '@angular/core';
import { NM_BP_MD_QUERY, mediaQuery } from '../overlay/viewport';

/** The bar currently on screen, for the toast offset (one wizard step at a time). */
@Injectable({ providedIn: 'root' })
export class NmFixedCtaOffset {
  private readonly bars = new Set<NmFixedCta>();

  register(bar: NmFixedCta): void {
    this.bars.add(bar);
  }

  unregister(bar: NmFixedCta): void {
    this.bars.delete(bar);
  }

  /** Toast offset in px: the bar height below 768px, 0 from 768px or without a bar. */
  toastOffset(): number {
    let offset = 0;
    for (const bar of this.bars) offset = Math.max(offset, bar.toastOffset());
    return offset;
  }
}

@Component({
  selector: 'nm-fixed-cta',
  template: `
    <div class="nm-fixed-cta__bar">
      <div class="nm-fixed-cta__above"><ng-content select="[nmCtaAbove]" /></div>
      <ng-content />
    </div>
    <div class="nm-fixed-cta__spacer" aria-hidden="true" [style.height.px]="height()"></div>
  `,
  styleUrl: './fixed-cta.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmFixedCta implements AfterViewInit {
  /** Bar height in px (below 768px), whenever it changes. */
  readonly heightChange = output<number>();

  protected readonly height = signal(0);
  private readonly wide = mediaQuery(NM_BP_MD_QUERY);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly registry = inject(NmFixedCtaOffset);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.registry.register(this);
    this.destroyRef.onDestroy(() => this.registry.unregister(this));
  }

  ngAfterViewInit(): void {
    const bar = this.bar();
    if (!bar) return;
    this.measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.measure());
      observer.observe(bar);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
  }

  /** Bar height below 768px, else 0 (the bar is inline). */
  toastOffset(): number {
    if (this.wide()) return 0;
    return Math.round(this.bar()?.getBoundingClientRect().height ?? 0);
  }

  private bar(): HTMLElement | null {
    return this.host.querySelector<HTMLElement>('.nm-fixed-cta__bar');
  }

  private measure(): void {
    const next = this.toastOffset();
    if (next === this.height()) return;
    this.height.set(next);
    this.heightChange.emit(next);
  }
}
