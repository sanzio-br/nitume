import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Full-size image viewer (A-17, row 278): a scrim over the whole page with
 * one image centred (at most 92 vw × 88 vh, never cropped), a white header
 * line and the drawer's ✕. ESC, ✕ or a click on the scrim close it; focus is
 * trapped on ✕ and returned to the element that opened it. It shows the
 * `src` it is given and never stores it; no download control, no referrer.
 * The host moves to `<body>` so the scrim covers the page, not the drawer.
 */
@Component({
  selector: 'app-image-viewer',
  imports: [],
  template: `
    <div
      class="image-viewer"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="label()"
      (click)="closed.emit()"
      (keydown)="onKeydown($event)"
    >
      <div class="image-viewer-head" (click)="$event.stopPropagation()">
        <span>{{ label() }}</span>
        <button
          #close
          type="button"
          class="drawer-close"
          aria-label="Close"
          (click)="closed.emit()"
        >
          ✕
        </button>
      </div>
      @if (src(); as url) {
        <img
          class="image-viewer-img"
          [src]="url"
          [alt]="alt()"
          referrerpolicy="no-referrer"
          decoding="async"
          (click)="$event.stopPropagation()"
        />
      } @else {
        <div class="image-viewer-wait" aria-busy="true">Loading image…</div>
      }
    </div>
  `,
  styles: [],
})
export class ImageViewerComponent implements OnInit, OnDestroy {
  /** The live signed link; null while a new one is being asked for. */
  readonly src = input<string | null>(null);
  /** Header line `{check label} · {runner}`. */
  readonly label = input('');
  readonly alt = input('');

  readonly closed = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('close');
  private readonly restoreFocus = document.activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => this.closeButton()?.nativeElement.focus());
  }

  /** Captured before the drawer's ESC handler: ESC closes the viewer only. */
  private readonly onEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    event.preventDefault();
    this.closed.emit();
  };

  ngOnInit(): void {
    document.body.appendChild(this.host.nativeElement);
    document.addEventListener('keydown', this.onEscape, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onEscape, true);
    this.host.nativeElement.remove();
    if (this.restoreFocus?.isConnected) this.restoreFocus.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      // ✕ is the only control: focus stays on it.
      event.preventDefault();
      this.closeButton()?.nativeElement.focus();
    }
  }
}
