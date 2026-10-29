// `nm-panel` (ui-kit spec §4.9, WQ-3 approved). Bottom sheet below 768px;
// from 768px the same panel, bottom-anchored and centred, max-width 560px.
// Flutter: showModalBottomSheet + bottomSheetTheme, showDragHandle.
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
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
  viewChild,
} from '@angular/core';
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
  imports: [NgComponentOutlet, NgTemplateOutlet],
  template: `
    <div class="nm-overlay__scrim" (click)="onScrim()"></div>
    <div
      #sheet
      class="nm-panel"
      [class.nm-panel--centered]="wide()"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="config().title ? titleId : null"
      [attr.tabindex]="config().title ? null : -1"
    >
      <span class="nm-panel__handle" aria-hidden="true"></span>
      @if (config().title; as title) {
        <h2 #title class="nm-panel__title" [id]="titleId" tabindex="-1">{{ title }}</h2>
      }
      @if (componentContent(); as type) {
        <ng-container *ngComponentOutlet="type; injector: contentInjector() ?? undefined" />
      }
      @if (templateContent(); as tpl) {
        <ng-container [ngTemplateOutlet]="tpl" [ngTemplateOutletContext]="{ $implicit: ref, data: config().data }" />
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

  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  surface(): HTMLElement | null {
    return this.sheet()?.nativeElement ?? null;
  }

  initialFocus(): HTMLElement | null {
    return this.title()?.nativeElement ?? this.surface();
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
