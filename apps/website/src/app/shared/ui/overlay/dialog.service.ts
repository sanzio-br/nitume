// `NmDialogService` (ui-kit spec §4.8). `open()` hosts a component or a
// template in `nm-dialog`; `confirm()` is the Flutter showNitumeConfirmDialog.
import {
  ApplicationRef,
  EnvironmentInjector,
  Injectable,
  TemplateRef,
  Type,
  inject,
} from '@angular/core';
import { NmDialog, NmDialogConfig } from './dialog.component';
import { attachOverlay } from './overlay-host';
import { NmOverlayRef } from './overlay-ref';

export interface NmConfirmOptions {
  readonly title: string;
  readonly body?: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  /** Red confirm label (outline variant; never a red fill). */
  readonly destructive?: boolean;
  readonly dismissible?: boolean;
}

@Injectable({ providedIn: 'root' })
export class NmDialogService {
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);

  open<R = unknown, D = unknown>(
    content: Type<unknown> | TemplateRef<unknown> | null,
    config: NmDialogConfig<D> = {},
  ): NmOverlayRef<R> {
    const ref = new NmOverlayRef<R>();
    attachOverlay({
      appRef: this.appRef,
      environmentInjector: this.environmentInjector,
      container: NmDialog,
      ref: ref as NmOverlayRef<unknown>,
      data: config.data,
      setup: (component, contentInjector) => {
        component.instance.config.set(config);
        component.instance.content.set(content);
        component.instance.contentInjector.set(contentInjector);
      },
    });
    return ref;
  }

  /**
   * Confirm first as outline (red when destructive), cancel second as
   * primary. Resolves `true` only on confirm.
   */
  async confirm(options: NmConfirmOptions): Promise<boolean> {
    const ref = this.open<boolean>(null, {
      title: options.title,
      body: options.body,
      dismissible: options.dismissible,
      role: 'alertdialog',
      actions: [
        {
          label: options.confirmLabel,
          variant: 'outline',
          destructive: !!options.destructive,
          value: true,
        },
        { label: options.cancelLabel, variant: 'primary', value: false },
      ],
    });
    return (await ref.closed) === true;
  }
}
