// Helpers for the #7 customer view specs: open a real `/app/customer/**`
// route signed in as a customer (the #6 harness), reach the route-provided
// TaskDraftStore, answer the view's requests and read the dialog.
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TaskDraftStore } from '../app/app-area/customer/new-task/task-draft.store';
import { ErrandView } from '../app/app-area/customer/data/errands.api';
import { AppHarness, OpenOptions, openApp } from './app-harness';
import { API, httpMock, userJson } from './auth';

export const CUSTOMER = () => userJson({ role: 'customer', displayName: 'Achieng Wanjiru' });

/** Opens `url` signed in as a customer (Achieng Wanjiru unless `restore` says otherwise). */
export function openCustomer(url: string, opts: OpenOptions = {}): Promise<AppHarness> {
  return openApp(url, { restore: CUSTOMER(), ...opts });
}

/** The draft store the `new` route provides (read through a rendered step). */
export function draftOf(h: AppHarness, page: Type<unknown>): TaskDraftStore {
  const el = h.harness.fixture.debugElement.query(By.directive(page));
  if (!el) throw new Error(`${page.name} is not rendered`);
  return el.injector.get(TaskDraftStore);
}

/** Pending requests to `path` (under the API base). */
export function pending(path: string) {
  return httpMock().match((r) => r.urlWithParams === `${API}${path}`);
}

/** The open dialog's action buttons (label, classes). */
export function dialogActions(): { label: string; classes: string }[] {
  return Array.from(document.body.querySelectorAll('nm-dialog .nm-dialog__actions button')).map((b) => ({
    label: (b.textContent ?? '').trim(),
    classes: b.className,
  }));
}

export function dialogButton(label: string): HTMLButtonElement {
  const found = Array.from(document.body.querySelectorAll<HTMLButtonElement>('nm-dialog .nm-dialog__actions button')).find(
    (b) => (b.textContent ?? '').trim() === label,
  );
  if (!found) throw new Error(`No dialog button ${label}`);
  return found;
}

/** An `ErrandView` with sensible defaults. */
export function errand(overrides: Partial<ErrandView> & { id: string }): ErrandView {
  return {
    category: 'inspection',
    title: null,
    reference: null,
    status: 'REQUESTED',
    createdAt: '2026-10-28T08:00:00.000Z',
    updatedAt: null,
    assignment: null,
    ...overrides,
  };
}

/** Removes overlays left in the body by a test. */
export function clearOverlays(): void {
  document.body.querySelectorAll('nm-dialog, nm-panel').forEach((el) => el.remove());
  for (const el of Array.from(document.body.children)) el.removeAttribute('inert');
  document.body.style.overflow = '';
}

export { TestBed };
