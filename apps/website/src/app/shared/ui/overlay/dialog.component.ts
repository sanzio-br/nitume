// `nm-dialog` (ui-kit spec §4.8; Flutter NitumeDialog / showNitumeConfirmDialog
// C-35). Created by `NmDialogService`; views never build their own overlay.
// No view queries and no NgTemplateOutlet (WQ-33, #7 §W9a).
import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  TemplateRef,
  Type,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NmButton } from '../button/button.component';
import { NmTemplateOutlet } from '../template-outlet.directive';
import { NmOverlayContainer, trapTab } from './overlay-host';
import { NmOverlayRef } from './overlay-ref';

export interface NmDialogAction<R = unknown> {
  readonly label: string;
  readonly variant?: 'primary' | 'secondary' | 'outline' | 'text';
  readonly destructive?: boolean;
  /** Close result when pressed. */
  readonly value?: R;
}

export interface NmDialogConfig<D = unknown> {
  readonly title?: string;
  readonly body?: string;
  /** False blocks scrim click and Escape (e.g. price-change authorisation). */
  readonly dismissible?: boolean;
  readonly role?: 'dialog' | 'alertdialog';
  /** Full-width vertical action stack. */
  readonly actions?: readonly NmDialogAction[];
  readonly data?: D;
}

let nextId = 0;

@Component({
  selector: 'nm-dialog',
  imports: [NgComponentOutlet, NmTemplateOutlet, NmButton],
  templateUrl: './dialog.component.html',
  styleUrl: './dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nm-overlay',
    '(keydown)': 'onKeydown($event)',
  },
})
export class NmDialog implements NmOverlayContainer {
  protected readonly ref = inject(NmOverlayRef);

  readonly config = signal<NmDialogConfig>({});
  readonly content = signal<Type<unknown> | TemplateRef<unknown> | null>(null);
  readonly contentInjector = signal<Injector | null>(null);

  protected readonly id = `nm-dialog-${nextId++}`;
  protected readonly titleId = `${this.id}-title`;
  protected readonly bodyId = `${this.id}-body`;

  protected readonly componentContent = computed(() => {
    const c = this.content();
    return c && !(c instanceof TemplateRef) ? c : null;
  });
  protected readonly templateContent = computed(() => {
    const c = this.content();
    return c instanceof TemplateRef ? c : null;
  });
  protected readonly dismissible = computed(() => this.config().dismissible !== false);

  // Element lookups instead of view queries (WQ-33, #7 §W9a), read at the
  // same moments the queries were: on keydown and after the first render.
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  surface(): HTMLElement | null {
    return this.host.querySelector<HTMLElement>('.nm-dialog');
  }

  initialFocus(): HTMLElement | null {
    return (
      this.host.querySelector<HTMLElement>('.nm-dialog__title') ??
      this.surface()?.querySelector<HTMLElement>('button, a[href], input, textarea') ??
      null
    );
  }

  protected onScrim(): void {
    if (this.dismissible()) this.ref.close(undefined);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (this.dismissible()) this.ref.close(undefined);
      return;
    }
    trapTab(event, this.surface());
  }

  protected press(action: NmDialogAction): void {
    this.ref.close(action.value);
  }
}
