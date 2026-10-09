import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NumTextComponent } from './num-text.component';

let nextId = 0;

/**
 * Confirm dialog (A-08): scrim over the drawer and a white card with a
 * title, projected body and right-aligned `Back` (outline) + confirm
 * (primary). Focus is trapped; initial focus is `Back`, or in form mode the
 * first element marked `data-autofocus`. ESC = Back. While `busy`, both
 * buttons are disabled, the confirm reads `busyLabel` and the dialog can't
 * be dismissed. No red buttons.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [NumTextComponent],
  template: `
    @if (open()) {
      <div class="confirm-scrim" (click)="onScrim()">
        <div
          #card
          class="confirm-card"
          [class.is-form]="form()"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          (click)="$event.stopPropagation()"
          (keydown)="onKeydown($event)"
        >
          <h3 [id]="titleId"><app-num-text [text]="title()" /></h3>
          <div class="confirm-body"><ng-content /></div>
          <div class="confirm-actions">
            <button
              #back
              type="button"
              class="btn btn-outline"
              [disabled]="busy()"
              (click)="dismiss()"
            >
              {{ cancelLabel() }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="busy() || confirmDisabled()"
              (click)="confirmed.emit()"
            >
              {{ busy() ? busyLabel() : confirmLabel() }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [],
})
export class ConfirmDialogComponent {
  readonly open = input(false);
  readonly title = input<string>('');
  readonly confirmLabel = input<string>('Confirm');
  readonly cancelLabel = input<string>('Back');
  readonly busyLabel = input<string>('Saving…');
  readonly busy = input(false);
  readonly confirmDisabled = input(false);
  /** Form mode: wider card (440) and initial focus on `[data-autofocus]`. */
  readonly form = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly titleId = `cd-${++nextId}-title`;
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private readonly back = viewChild<ElementRef<HTMLButtonElement>>('back');
  private readonly injector = inject(Injector);
  private restoreFocus: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.restoreFocus = document.activeElement as HTMLElement | null;
        afterNextRender(() => this.focusInitial(), { injector: this.injector });
      } else if (this.restoreFocus) {
        const el = this.restoreFocus;
        this.restoreFocus = null;
        if (el.isConnected) el.focus();
      }
    });
  }

  protected dismiss(): void {
    if (!this.busy()) {
      this.cancelled.emit();
    }
  }

  protected onScrim(): void {
    this.dismiss();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Keep the drawer open: ESC only backs out of the dialog.
      event.stopPropagation();
      event.preventDefault();
      this.dismiss();
      return;
    }
    if (event.key === 'Tab') {
      this.trapTab(event);
    }
  }

  private focusables(): HTMLElement[] {
    const root = this.card()?.nativeElement;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !(el as HTMLButtonElement).disabled);
  }

  private trapTab(event: KeyboardEvent): void {
    const items = this.focusables();
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !items.includes(active as HTMLElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusInitial(): void {
    const root = this.card()?.nativeElement;
    if (!root) return;
    const auto = this.form() ? root.querySelector<HTMLElement>('[data-autofocus]') : null;
    (auto ?? this.back()?.nativeElement ?? root).focus();
  }
}
