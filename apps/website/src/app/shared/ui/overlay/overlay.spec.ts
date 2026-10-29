import { ApplicationRef, Component, TemplateRef, inject, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { declared } from '../../../../testing/css';
import {
  NM_OVERLAY_DATA,
  NmDialogService,
  NmOverlayRef,
  NmPanelService,
  NmToastHost,
  NmToastService,
} from './index';

@Component({
  template: `<button id="opener">Open</button>`,
})
class Opener {}

function setupOpener() {
  const fixture = TestBed.createComponent(Opener);
  fixture.detectChanges();
  const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
  opener.focus();
  return { fixture, opener };
}

function key(target: Element, k: string, shiftKey = false) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }));
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

function stubMatchMedia(matches: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) =>
    ({
      matches: query === '(min-width: 768px)' ? matches : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe('dialog, panel, toast (§12.8)', () => {
  afterEach(() => {
    document.querySelectorAll('nm-dialog, nm-panel').forEach((el) => el.remove());
    document.body.style.overflow = '';
  });

  it('34. dialog: title, body, vertical actions, max-width 335px, scrim token, aria-modal, focus in and back to the opener', async () => {
    const { fixture, opener } = setupOpener();
    const dialogs = TestBed.inject(NmDialogService);
    const ref = dialogs.open<string>(null, {
      title: 'Cancel this task?',
      body: 'Your runner will be told.',
      actions: [
        { label: 'Keep task', variant: 'primary', value: 'keep' },
        { label: 'Cancel task', variant: 'outline', destructive: true, value: 'cancel' },
      ],
    });

    const host = document.querySelector('nm-dialog') as HTMLElement;
    const card = host.querySelector('.nm-dialog') as HTMLElement;
    const title = card.querySelector('h2') as HTMLElement;
    const body = card.querySelector('.nm-dialog__body') as HTMLElement;

    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('true');
    expect(card.getAttribute('aria-labelledby')).toBe(title.id);
    expect(card.getAttribute('aria-describedby')).toBe(body.id);
    expect(title.textContent).toBe('Cancel this task?');
    expect(getComputedStyle(title).fontSize).toBe('17px');
    expect(getComputedStyle(title).fontWeight).toBe('600');
    expect(getComputedStyle(body).color).toBe('var(--nitume-slate-600)');

    const cs = getComputedStyle(card);
    expect(cs.maxWidth).toBe('335px');
    expect(cs.width).toBe('calc(100% - 40px)');
    expect(cs.backgroundColor).toBe('var(--nitume-white)');
    expect(cs.borderRadius).toBe('var(--nitume-r-l)');
    expect(cs.paddingTop).toBe('20px');
    const scrim = host.querySelector('.nm-overlay__scrim') as HTMLElement;
    expect(getComputedStyle(scrim).backgroundColor).toBe('var(--nitume-scrim)');

    const actions = card.querySelector('.nm-dialog__actions') as HTMLElement;
    expect(getComputedStyle(actions).flexDirection).toBe('column');
    expect(getComputedStyle(actions).gap).toBe('10px');
    const buttons = Array.from(actions.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Keep task', 'Cancel task']);
    expect(actions.querySelectorAll('nm-button.nm-button--expand')).toHaveLength(2);

    // Focus moved in (title), page behind inert, scroll locked.
    expect(document.activeElement).toBe(title);
    expect(fixture.nativeElement.closest('[inert]')).not.toBeNull();
    expect(host.closest('[inert]')).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');

    // Focus trap: Tab from the last action wraps to the first.
    buttons[1].focus();
    key(buttons[1], 'Tab');
    expect(document.activeElement).toBe(buttons[0]);
    key(buttons[0], 'Tab', true);
    expect(document.activeElement).toBe(buttons[1]);

    // Error line.
    ref.setError('Could not cancel. Try again.');
    TestBed.inject(ApplicationRef).tick();
    const error = card.querySelector('.nm-dialog__error') as HTMLElement;
    expect(error.getAttribute('role')).toBe('alert');
    expect(getComputedStyle(error).color).toBe('var(--nitume-red)');

    buttons[0].click();
    expect(await ref.closed).toBe('keep');
    expect(document.querySelector('nm-dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(fixture.nativeElement.closest('[inert]')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('35. confirm(): confirm is outline (red when destructive) and first, cancel is primary and second; true only on confirm', async () => {
    setupOpener();
    const dialogs = TestBed.inject(NmDialogService);
    const buttons = () =>
      Array.from(document.querySelectorAll('nm-dialog .nm-dialog__actions button')) as HTMLButtonElement[];

    let result = dialogs.confirm({
      title: 'Decline this offer?',
      confirmLabel: 'Decline',
      cancelLabel: 'Keep offer',
      destructive: true,
    });
    const card = document.querySelector('nm-dialog .nm-dialog') as HTMLElement;
    expect(card.getAttribute('role')).toBe('alertdialog');
    const [confirm, cancel] = buttons();
    expect(confirm.textContent?.trim()).toBe('Decline');
    expect(confirm.classList).toContain('nm-btn--outline');
    expect(confirm.classList).toContain('nm-btn--destructive');
    expect(getComputedStyle(confirm).color).toBe('var(--nitume-red)');
    expect(cancel.textContent?.trim()).toBe('Keep offer');
    expect(cancel.classList).toContain('nm-btn--primary');
    confirm.click();
    expect(await result).toBe(true);

    result = dialogs.confirm({ title: 'Leave?', confirmLabel: 'Leave', cancelLabel: 'Stay' });
    expect(buttons()[0].classList).not.toContain('nm-btn--destructive');
    buttons()[1].click();
    expect(await result).toBe(false);

    result = dialogs.confirm({ title: 'Leave?', confirmLabel: 'Leave', cancelLabel: 'Stay' });
    (document.querySelector('nm-dialog .nm-overlay__scrim') as HTMLElement).click();
    expect(await result).toBe(false);

    result = dialogs.confirm({ title: 'Leave?', confirmLabel: 'Leave', cancelLabel: 'Stay' });
    key(document.activeElement!, 'Escape');
    expect(await result).toBe(false);
    expect(document.querySelector('nm-dialog')).toBeNull();
  });

  it('36. dismissible: false keeps the dialog open on scrim click and Escape', async () => {
    setupOpener();
    const dialogs = TestBed.inject(NmDialogService);
    let settled = false;
    const result = dialogs
      .confirm({
        title: 'Approve the new price?',
        confirmLabel: 'Approve',
        cancelLabel: 'Reject',
        dismissible: false,
      })
      .then((v) => {
        settled = true;
        return v;
      });
    (document.querySelector('nm-dialog .nm-overlay__scrim') as HTMLElement).click();
    key(document.activeElement!, 'Escape');
    await flush();
    expect(settled).toBe(false);
    expect(document.querySelector('nm-dialog')).not.toBeNull();
    (document.querySelectorAll('nm-dialog .nm-dialog__actions button')[0] as HTMLElement).click();
    expect(await result).toBe(true);
  });

  it('37. panel: bottom-docked full width below 768px, centred max 560px from 768px, handle aria-hidden, Escape, focus trap', async () => {
    @Component({
      template: `
        <button id="opener">Open</button>
        <ng-template #menu let-ref>
          <button id="first" (click)="ref.close('first')">Gallery</button>
          <button id="last">Camera</button>
        </ng-template>
      `,
    })
    class MenuHost {
      readonly menu = viewChild.required<TemplateRef<unknown>>('menu');
    }
    const menuFixture = TestBed.createComponent(MenuHost);
    menuFixture.detectChanges();
    const opener = menuFixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
    const panels = TestBed.inject(NmPanelService);

    // Narrow viewport.
    let restore = stubMatchMedia(false);
    opener.focus();
    let ref = panels.open<string>(menuFixture.componentInstance.menu(), { title: 'Add photos' });
    let sheet = document.querySelector('nm-panel .nm-panel') as HTMLElement;
    expect(sheet.classList).not.toContain('nm-panel--centered');
    expect(getComputedStyle(sheet).width).toBe('100%');
    expect(getComputedStyle(sheet).maxWidth).not.toBe('560px');
    expect(getComputedStyle(sheet).maxHeight).toBe('90vh');
    expect(getComputedStyle(sheet).backgroundColor).toBe('var(--nitume-white)');
    expect(getComputedStyle(sheet).borderRadius).toBe('var(--nitume-r-l) var(--nitume-r-l) 0 0');
    expect(getComputedStyle(document.querySelector('nm-panel')!).alignItems).toBe('flex-end');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    const handle = sheet.querySelector('.nm-panel__handle') as HTMLElement;
    expect(handle.getAttribute('aria-hidden')).toBe('true');
    expect(getComputedStyle(handle).width).toBe('32px');
    expect(getComputedStyle(handle).height).toBe('4px');
    expect(getComputedStyle(handle).backgroundColor).toBe('var(--nitume-slate-line)');
    expect(getComputedStyle(document.querySelector('nm-panel .nm-overlay__scrim')!).backgroundColor).toBe(
      'var(--nitume-scrim)',
    );
    expect(document.activeElement?.textContent).toBe('Add photos');

    // Focus trap.
    const first = sheet.querySelector('#first') as HTMLElement;
    const last = sheet.querySelector('#last') as HTMLElement;
    last.focus();
    key(last, 'Tab');
    expect(document.activeElement).toBe(first);

    // Escape closes (dismissible by default) and focus returns.
    key(first, 'Escape');
    expect(await ref.closed).toBeUndefined();
    expect(document.querySelector('nm-panel')).toBeNull();
    expect(document.activeElement).toBe(opener);
    restore();

    // Wide viewport: centred, max-width 560px, still bottom-anchored.
    restore = stubMatchMedia(true);
    ref = panels.open<string>(menuFixture.componentInstance.menu());
    sheet = document.querySelector('nm-panel .nm-panel') as HTMLElement;
    expect(sheet.classList).toContain('nm-panel--centered');
    expect(getComputedStyle(sheet).maxWidth).toBe('560px');
    expect(getComputedStyle(sheet).marginLeft).toBe('auto');
    expect(getComputedStyle(sheet).marginRight).toBe('auto');
    expect(getComputedStyle(document.querySelector('nm-panel')!).alignItems).toBe('flex-end');
    (sheet.querySelector('#first') as HTMLElement).click();
    expect(await ref.closed).toBe('first');
    restore();

    // Not dismissible: Escape keeps it open.
    ref = panels.open<string>(menuFixture.componentInstance.menu(), { dismissible: false });
    key(document.querySelector('nm-panel .nm-panel')!, 'Escape');
    await flush();
    expect(ref.isOpen).toBe(true);
    ref.close();
  });

  it('overlay content components receive the ref and data', async () => {
    @Component({ template: `<p id="payload">{{ data.name }}</p>` })
    class Content {
      readonly data = inject(NM_OVERLAY_DATA) as { name: string };
      readonly ref = inject(NmOverlayRef);
    }
    setupOpener();
    const ref = TestBed.inject(NmDialogService).open(Content, { title: 'Runner', data: { name: 'Brian K.' } });
    expect(document.querySelector('nm-dialog #payload')?.textContent).toBe('Brian K.');
    ref.close();
    expect(await ref.closed).toBeUndefined();
  });

  it('38. toast: blue-700 fill and white text, role="status", replaces, auto-dismisses after 4s, pauses on hover/focus', () => {
    vi.useFakeTimers();
    try {
      @Component({ imports: [NmToastHost], template: `<nm-toast-host />` })
      class Shell {}
      const fixture = TestBed.createComponent(Shell);
      fixture.detectChanges();
      const toasts = TestBed.inject(NmToastService);
      const region = fixture.nativeElement.querySelector('.nm-toast-region') as HTMLElement;
      const toast = () => region.querySelector('.nm-toast') as HTMLElement | null;
      const render = () => fixture.detectChanges();

      expect(region.getAttribute('role')).toBe('status');
      expect(region.getAttribute('aria-live')).toBe('polite');
      expect(toast()).toBeNull();

      toasts.show('Copied');
      render();
      const cs = getComputedStyle(toast()!);
      expect(toast()!.textContent?.trim()).toBe('Copied');
      expect(cs.backgroundColor).toBe('var(--nitume-blue-700)');
      expect(cs.color).toBe('var(--nitume-white)');
      expect(cs.fontSize).toBe('13.5px');
      expect(cs.borderRadius).toBe('var(--nitume-r-s)');
      expect(cs.maxWidth).toBe('560px');
      expect(cs.paddingTop).toBe('14px');
      expect(declared('.nm-toast-region', 'bottom')[0]).toContain('safe-area-inset-bottom');

      // A second show replaces the first (one at a time).
      vi.advanceTimersByTime(3000);
      toasts.show('That offer is no longer available.');
      render();
      expect(region.querySelectorAll('.nm-toast')).toHaveLength(1);
      expect(toast()!.textContent?.trim()).toBe('That offer is no longer available.');
      vi.advanceTimersByTime(3999);
      render();
      expect(toast()).not.toBeNull();
      vi.advanceTimersByTime(1);
      render();
      expect(toast()).toBeNull();

      // Hover pauses, leaving resumes with the remaining time.
      toasts.show('Please sign in again.');
      render();
      vi.advanceTimersByTime(1000);
      toast()!.dispatchEvent(new MouseEvent('mouseenter'));
      vi.advanceTimersByTime(10000);
      render();
      expect(toast()).not.toBeNull();
      toast()!.dispatchEvent(new MouseEvent('mouseleave'));
      vi.advanceTimersByTime(2999);
      render();
      expect(toast()).not.toBeNull();
      vi.advanceTimersByTime(1);
      render();
      expect(toast()).toBeNull();

      // Focus pauses too.
      toasts.show('Copied');
      render();
      toast()!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      vi.advanceTimersByTime(8000);
      render();
      expect(toast()).not.toBeNull();
      toast()!.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      vi.advanceTimersByTime(4000);
      render();
      expect(toast()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
