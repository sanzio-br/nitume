// `NmPanelService` (ui-kit spec §4.9). The panel hosts short secondary
// content (menus, radio groups, small forms), never a primary flow.
import {
  ApplicationRef,
  EnvironmentInjector,
  Injectable,
  TemplateRef,
  Type,
  inject,
} from '@angular/core';
import { attachOverlay } from './overlay-host';
import { NmOverlayRef } from './overlay-ref';
import { NmPanel, NmPanelConfig } from './panel.component';

@Injectable({ providedIn: 'root' })
export class NmPanelService {
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);

  open<R = unknown, D = unknown>(
    content: Type<unknown> | TemplateRef<unknown>,
    config: NmPanelConfig<D> = {},
  ): NmOverlayRef<R> {
    const ref = new NmOverlayRef<R>();
    attachOverlay({
      appRef: this.appRef,
      environmentInjector: this.environmentInjector,
      container: NmPanel,
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
}
