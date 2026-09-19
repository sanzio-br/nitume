import { Component, HostListener, input, output } from '@angular/core';

/**
 * Slide-in ops drawer (design mockup `.drawer`): fixed right panel over a
 * dimmed overlay. The drawer stays mounted so the slide transition runs in
 * both directions; consumers gate the projected content on `open()`. ESC or
 * overlay/✕ close. Styling lives in `styles/_ops.scss` (global `.drawer`).
 */
@Component({
  selector: 'app-ops-drawer',
  imports: [],
  template: `
    <div class="drawer-overlay" [class.active]="open()" (click)="close()"></div>
    <aside
      class="drawer"
      [class.active]="open()"
      role="dialog"
      aria-modal="true"
      [attr.aria-hidden]="!open()"
      [attr.aria-label]="title()"
    >
      <header class="drawer-head">
        <h3>{{ title() }}</h3>
        <button type="button" class="drawer-close" (click)="close()" aria-label="Close">✕</button>
      </header>
      <div class="drawer-body"><ng-content /></div>
    </aside>
  `,
  styles: [],
})
export class OpsDrawerComponent {
  readonly open = input(false);
  readonly title = input<string>('');

  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }
}
