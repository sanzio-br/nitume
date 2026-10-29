// Wizard guards (customer-v-new-category §W3, §W8).
// - wizardEntryGuard (on the `new` parent): Angular runs it only when the
//   parent activates, i.e. when coming from outside the wizard: a fresh
//   draft with `openerUrl` = the previous URL and `?category` preselected
//   when it is one of the five MVP values; any other value is dropped with
//   a replaceUrl redirect. Back into a step after a submit is left to the
//   step guard, which sends it to `openerUrl`.
// - wizardStepGuard(n): step 2 needs a category, step 3 also a validated
//   step 2; otherwise step 1 (or step 2), or `openerUrl` after a submit.
// - wizardLeaveGuard: acts only when leaving the wizard; discard confirm
//   when the draft holds data; blocked silently while submitting; an
//   unsubmitted DRAFT is cancelled best effort (§W8).
import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, RedirectCommand, Router, UrlTree } from '@angular/router';
import { NmDialogService } from '../../../shared/ui/overlay/dialog.service';
import { customerLinks } from '../customer-links';
import { CustomerErrandsApi } from '../data/errands.api';
import { TaskDraftStore, isWizardCategory } from './task-draft.store';

/** Discard dialog (proposed copy, built in the app). */
export const DISCARD_CONFIRM = {
  title: 'Discard this task?',
  body: "What you've entered so far will be lost.",
  confirmLabel: 'Discard',
  cancelLabel: 'Keep editing',
  destructive: true,
} as const;

function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}

/** `/app/customer/new` and its steps. */
export function isWizardUrl(url: string): boolean {
  const path = pathOf(url);
  const root = customerLinks.newTask();
  return path === root || path.startsWith(`${root}/`);
}

function redirect(router: Router, url: string): RedirectCommand {
  return new RedirectCommand(router.parseUrl(url), { replaceUrl: true });
}

export const wizardEntryGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const store = inject(TaskDraftStore);
  const raw = route.queryParamMap.get('category');
  if (raw !== null && !isWizardCategory(raw)) {
    const tree: UrlTree = router.parseUrl(state.url);
    delete tree.queryParams['category'];
    return new RedirectCommand(tree, { replaceUrl: true });
  }
  // Browser Back into step 2/3 after a submit: the step guard redirects.
  if (store.submitted && pathOf(state.url) !== customerLinks.newTask()) return true;
  const previous = router.currentNavigation()?.previousNavigation?.finalUrl;
  const opener = previous ? router.serializeUrl(previous) : null;
  store.start(opener && !isWizardUrl(opener) ? opener : customerLinks.home(), isWizardCategory(raw) ? raw : null);
  return true;
};

export function wizardStepGuard(step: 2 | 3): CanActivateFn {
  return () => {
    const router = inject(Router);
    const store = inject(TaskDraftStore);
    const hasCategory = store.category() !== null;
    if (step === 2 && hasCategory) return true;
    if (step === 3 && hasCategory && store.detailsValidated) return true;
    if (store.submitted) return redirect(router, store.openerUrl);
    return redirect(router, step === 3 && hasCategory ? customerLinks.newTaskDetails() : customerLinks.newTask());
  };
}

/** Cancels an unsubmitted DRAFT (best effort, errors ignored), then resets the draft. */
export function discardDraft(store: TaskDraftStore, api: CustomerErrandsApi): void {
  const id = store.submitted ? null : store.createdErrandId;
  if (id) void api.cancelDraft(id).catch(() => undefined);
  store.reset();
}

export const wizardLeaveGuard: CanDeactivateFn<unknown> = async (_component, _route, _state, nextState) => {
  if (nextState && isWizardUrl(nextState.url)) return true;
  const store = inject(TaskDraftStore);
  const api = inject(CustomerErrandsApi);
  const dialog = inject(NmDialogService);
  if (store.submitting()) return false;
  if (store.submitted) return true;
  if (store.hasData()) {
    const discard = await dialog.confirm(DISCARD_CONFIRM);
    if (!discard) return false;
  }
  if (store.createdErrandId || store.hasData()) discardDraft(store, api);
  return true;
};
