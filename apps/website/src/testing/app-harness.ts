// Opens real `/app` routes (guards, lazy chunks, interceptor) with fake
// HTTP, WINDOW, BroadcastChannel and socket for the #6 view and shell
// suites.
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app/app.routes';
import { APP_LINKS } from '../app/app-area/app-links';
import { AppRole } from '../app/core/auth/auth.tokens';
import { provideLazySession } from '../app/core/lazy-session/lazy-session';
import { SignInFlow, SignInFlowStore } from '../app/core/auth/sign-in-flow.store';
import { UserMe } from '../app/core/api-types';
import { SOCKET_IO_FACTORY } from '../app/core/realtime/realtime.tokens';
import { AppLinks } from '../environments/environment';
import { API, AuthRig, authRig, ensureLocalStorage, expectRequest, restoreSignedIn, restoreSignedOut, settle } from './auth';
import { stubViewport } from './media';

export const NO_LINKS: AppLinks = { termsUrl: '', privacyUrl: '', supportUrl: '' };

export interface OpenOptions {
  /** How the restore triggered by the first guard is answered. */
  restore?: 'signedOut' | 'failed' | UserMe | 'none';
  links?: Partial<Record<AppRole, AppLinks>>;
  flow?: { role: AppRole; flow: SignInFlow };
  /** Viewport width for matchMedia (default 360). */
  width?: number;
}

export interface AppHarness {
  harness: RouterTestingHarness;
  rig: AuthRig;
  router: Router;
  root: () => HTMLElement;
  detect: () => Promise<void>;
  sockets: unknown[];
}


export async function openApp(url: string, opts: OpenOptions = {}): Promise<AppHarness> {
  ensureLocalStorage();
  TestBed.resetTestingModule();
  const restoreViewport = stubViewport(opts.width ?? 360);
  const rig = authRig({ pathname: url.split('?')[0] });
  const sockets: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      ...rig.providers,
      provideRouter(routes),
      ...provideLazySession(),
      {
        provide: APP_LINKS,
        useValue: { customer: NO_LINKS, runner: NO_LINKS, ...opts.links },
      },
      {
        provide: SOCKET_IO_FACTORY,
        useValue: () => {
          const socket = { on: () => socket, emit: () => socket, disconnect: () => socket };
          sockets.push(socket);
          return socket;
        },
      },
    ],
  });
  if (opts.flow) TestBed.inject(SignInFlowStore).set(opts.flow.role, opts.flow.flow);
  const harness = await RouterTestingHarness.create();
  const router = TestBed.inject(Router);
  // Keep WINDOW.location.pathname in step with the router (role of the URL).
  router.events.subscribe(() => {
    rig.win.location.pathname = router.url.split('?')[0];
  });
  const navigation = harness.navigateByUrl(url);
  const restore = opts.restore ?? 'signedOut';
  if (restore === 'signedOut') await restoreSignedOut();
  else if (restore === 'failed') (await expectRequest(`${API}/auth/web/refresh`)).error(new ProgressEvent('error'), { status: 0 });
  else if (restore !== 'none') await restoreSignedIn(restore);
  await navigation;
  await settle();
  harness.fixture.detectChanges();
  restoreViewport();
  return {
    harness,
    rig,
    router,
    sockets,
    root: () => harness.fixture.nativeElement as HTMLElement,
    detect: async () => {
      await settle();
      harness.fixture.detectChanges();
    },
  };
}

/** Types into an input as a user would (value + `input` event). */
export function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Submits the page form (Enter / submit button). */
export function submitForm(root: HTMLElement): void {
  const form = root.querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

/** Normalised visible text of an element. */
export function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
