// `nm-toast-host` (ui-kit spec §4.10): placed once in the signed-in shell
// (issue #6). The live region is always present; the toast renders inside.
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject } from '@angular/core';
import { NmToastService } from './toast.service';

@Component({
  selector: 'nm-toast-host',
  imports: [NgTemplateOutlet],
  template: `
    <div class="nm-toast-region" role="status" aria-live="polite" [style.--nm-toast-offset.px]="offset()">
      @if (toast.current(); as t) {
        <div
          class="nm-toast"
          (mouseenter)="toast.pause()"
          (mouseleave)="toast.resume()"
          (focusin)="toast.pause()"
          (focusout)="toast.resume()"
        >
          @if (asTemplate(t.message); as tpl) {
            <ng-container [ngTemplateOutlet]="tpl" />
          } @else {
            {{ t.message }}
          }
        </div>
      }
    </div>
  `,
  styleUrl: './toast-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmToastHost {
  protected readonly toast = inject(NmToastService);
  protected readonly offset = computed(() => this.toast.current()?.offset ?? 0);

  protected asTemplate(message: string | TemplateRef<unknown>): TemplateRef<unknown> | null {
    return message instanceof TemplateRef ? message : null;
  }
}
