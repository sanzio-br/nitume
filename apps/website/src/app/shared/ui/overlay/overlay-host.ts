// Shared mechanics for the dialog and the panel (ui-kit spec §4.8, §4.9):
// attach to the body, make the page behind `inert`, lock scroll, move focus
// in, trap it, return it to the opener on close.
import {
  ApplicationRef,
  ComponentRef,
  EnvironmentInjector,
  Injector,
  Type,
  createComponent,
} from '@angular/core';
import { NM_OVERLAY_DATA, NmOverlayRef } from './overlay-ref';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Implemented by the dialog and panel containers. */
export interface NmOverlayContainer {
  /** The element focus is trapped in. */
  surface(): HTMLElement | null;
  /** Title (tabindex -1) or first action. */
  initialFocus(): HTMLElement | null;
}

export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/** Tab / Shift+Tab cycle inside `root`. Returns true when handled. */
export function trapTab(event: KeyboardEvent, root: HTMLElement | null): boolean {
  if (event.key !== 'Tab' || !root) return false;
  const items = focusables(root);
  if (items.length === 0) {
    event.preventDefault();
    return true;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

export function attachOverlay<C extends NmOverlayContainer>(options: {
  appRef: ApplicationRef;
  environmentInjector: EnvironmentInjector;
  container: Type<C>;
  ref: NmOverlayRef<unknown>;
  data: unknown;
  setup: (component: ComponentRef<C>, contentInjector: Injector) => void;
}): ComponentRef<C> {
  const { appRef, environmentInjector, container, ref, data, setup } = options;
  const opener = document.activeElement as HTMLElement | null;

  const contentInjector = Injector.create({
    providers: [
      { provide: NmOverlayRef, useValue: ref },
      { provide: NM_OVERLAY_DATA, useValue: data },
    ],
    parent: environmentInjector,
  });

  const component = createComponent(container, {
    environmentInjector,
    elementInjector: contentInjector,
  });
  setup(component, contentInjector);
  appRef.attachView(component.hostView);
  const host = component.location.nativeElement as HTMLElement;
  document.body.appendChild(host);

  // The page behind is inert while the overlay is open.
  const madeInert: Element[] = [];
  for (const el of Array.from(document.body.children)) {
    if (el !== host && !el.hasAttribute('inert')) {
      el.setAttribute('inert', '');
      madeInert.push(el);
    }
  }
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  component.changeDetectorRef.detectChanges();
  component.instance.initialFocus()?.focus();

  ref.onDispose = () => {
    for (const el of madeInert) el.removeAttribute('inert');
    document.body.style.overflow = previousOverflow;
    appRef.detachView(component.hostView);
    component.destroy();
    host.remove();
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
  };
  return component;
}
