// `nm-panel` (ui-kit spec §4.9, WQ-3 approved). Bottom sheet below 768px;
// from 768px the same panel, bottom-anchored and centred, max-width 560px.
// Flutter: showModalBottomSheet + bottomSheetTheme, showDragHandle.
// No view queries and no @angular/common template outlet (WQ-33; #8 A§8,
// the treatment #7 gave `nm-dialog`).
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
import { NmTemplateOutlet } from '../template-outlet.directive';
import { NmOverlayContainer, trapTab } from './overlay-host';
import { NmOverlayRef } from './overlay-ref';
import { NM_BP_MD_QUERY, mediaQuery } from './viewport';

export interface NmPanelConfig<D = unknown> {
  readonly title?: string;
  readonly dismissible?: boolean;
  readonly data?: D;
}

let nextId = 0;

@Component({
  selector: 'nm-panel',
  imports: [NgComponentOutlet, NmTemplateOutlet],
  template: `
    <div class="nm-overlay__scrim" (click)="onScrim()"></div>
    <div
      class="nm-panel"
      [class.nm-panel--centered]="wide()"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="config().title ? titleId : null"
      [attr.tabindex]="config().title ? null : -1"
    >
      <span class="nm-panel__handle" aria-hidden="true"></span>
      @if (config().title; as title) {
        <h2 class="nm-panel__title" [id]="titleId" tabindex="-1">{{ title }}</h2>
      }
      @if (componentContent(); as type) {
        <ng-container *ngComponentOutlet="type; injector: contentInjector() ?? undefined" />
      }
      @if (templateContent(); as tpl) {
        <ng-container [nmTemplateOutlet]="tpl" [nmTemplateOutletContext]="{ $implicit: ref, data: config().data }" />
      }
    </div>
  `,
  styleUrl: './panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nm-overlay',
    '[class.nm-overlay--wide]': 'wide()',
    '(keydown)': 'onKeydown($event)',
  },
})
export class NmPanel implements NmOverlayContainer {
  protected readonly ref = inject(NmOverlayRef);

  readonly config = signal<NmPanelConfig>({});
  readonly content = signal<Type<unknown> | TemplateRef<unknown> | null>(null);
  readonly contentInjector = signal<Injector | null>(null);

  /** From `$nm-bp-md` (768px): centred, max-width 560px. */
  protected readonly wide = mediaQuery(NM_BP_MD_QUERY);
  protected readonly titleId = `nm-panel-${nextId++}-title`;

  protected readonly componentContent = computed(() => {
    const c = this.content();
    return c && !(c instanceof TemplateRef) ? c : null;
  });
  protected readonly templateContent = computed(() => {
    const c = this.content();
    return c instanceof TemplateRef ? c : null;
  });
  protected readonly dismissible = computed(() => this.config().dismissible !== false);

  // Element lookups instead of view queries (WQ-33), read at the same
  // moments the queries were: on keydown and after the first render.
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  surface(): HTMLElement | null {
    return this.host.querySelector<HTMLElement>('.nm-panel');
  }

  initialFocus(): HTMLElement | null {
    return this.host.querySelector<HTMLElement>('.nm-panel__title') ?? this.surface();
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
}
