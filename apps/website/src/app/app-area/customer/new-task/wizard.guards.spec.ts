// NC§W9.2, NC§W9.3, NC§W9.7, NC§W9.10: the wizard guards, on a route tree
// with the same shape as the customer routes (§W1).
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RedirectCommand, Router, RouterStateSnapshot, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NmDialogService } from '../../../shared/ui/overlay/dialog.service';
import { TaskDraftStore } from './task-draft.store';
import { DISCARD_CONFIRM, wizardEntryGuard, wizardLeaveGuard, wizardStepGuard } from './wizard.guards';

let lastStore: TaskDraftStore | null = null;

@Component({ template: 'page' })
class Page {
  constructor() {
    lastStore = inject(TaskDraftStore, { optional: true }) ?? lastStore;
  }
}

const ROUTES: Routes = [
  { path: 'app/customer/home', component: Page },
  { path: 'app/customer/history', component: Page },
  { path: 'app/customer/tasks/:id/quote', component: Page },
  {
    path: 'app/customer/new',
    providers: [TaskDraftStore],
    canActivate: [wizardEntryGuard],
    children: [
      { path: '', pathMatch: 'full', component: Page, canDeactivate: [wizardLeaveGuard] },
      { path: 'details', component: Page, canActivate: [wizardStepGuard(2)], canDeactivate: [wizardLeaveGuard] },
      { path: 'review', component: Page, canActivate: [wizardStepGuard(3)], canDeactivate: [wizardLeaveGuard] },
    ],
  },
];

async function setup(initialUrl = '/app/customer/home', answer = true) {
  lastStore = null;
  const confirm = vi.fn(async () => answer);
  TestBed.configureTestingModule({
    providers: [
      provideRouter(ROUTES),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: NmDialogService, useValue: { confirm } },
    ],
  });
  const harness = await RouterTestingHarness.create(initialUrl);
  const router = TestBed.inject(Router);
  const go = async (url: string) => {
    await harness.navigateByUrl(url);
    return router.url;
  };
  return { harness, router, go, confirm, store: () => lastStore as TaskDraftStore, http: TestBed.inject(HttpTestingController) };
}

describe('wizard guards', () => {
  describe('NC§W9.2 wizardStepGuard', () => {
    it('NC§W9.2 step 2 without a category → step 1', async () => {
      const { go } = await setup();
      expect(await go('/app/customer/new/details')).toBe('/app/customer/new');
    });

    it('NC§W9.2 step 3 without detailsValidated → step 1 with no category, step 2 with one', async () => {
      const { go, store } = await setup();
      expect(await go('/app/customer/new/review')).toBe('/app/customer/new');
      store().changeCategory('inspection');
      expect(await go('/app/customer/new/review')).toBe('/app/customer/new/details');
      store().detailsValidated = true;
      expect(await go('/app/customer/new/review')).toBe('/app/customer/new/review');
    });

    it('NC§W9.2 after submitted both steps redirect to openerUrl', async () => {
      const { go, store } = await setup('/app/customer/history');
      await go('/app/customer/new?category=inspection');
      store().detailsValidated = true;
      expect(await go('/app/customer/new/review')).toBe('/app/customer/new/review');
      store().submitted = true;
      expect(await go('/app/customer/tasks/e-1/quote')).toBe('/app/customer/tasks/e-1/quote');
      store().finish();
      expect(await go('/app/customer/new/details')).toBe('/app/customer/history');
      expect(await go('/app/customer/new/review')).toBe('/app/customer/history');
    });
  });

  describe('NC§W9.3 wizardEntryGuard', () => {
    it('NC§W9.3 from Home. a fresh draft with openerUrl /app/customer/home and the ?category preselected', async () => {
      const { go, store } = await setup('/app/customer/home');
      expect(await go('/app/customer/new?category=inspection')).toBe('/app/customer/new?category=inspection');
      expect(store().category()).toBe('inspection');
      expect(store().openerUrl).toBe('/app/customer/home');
      expect(store().hasData()).toBe(false);
    });

    it('NC§W9.3 new from step 2. keeps the draft and ignores ?category', async () => {
      const { go, store } = await setup();
      await go('/app/customer/new?category=inspection');
      await go('/app/customer/new/details');
      store().title.set('Apartment check');
      await go('/app/customer/new?category=queue_admin');
      expect(store().category()).toBe('inspection');
      expect(store().title()).toBe('Apartment check');
    });

    it('NC§W9.3 direct load. no previous navigation records /app/customer/home', async () => {
      const { store } = await setup('/app/customer/new');
      expect(store().openerUrl).toBe('/app/customer/home');
      expect(store().category()).toBeNull();
    });

    it('NC§W9.3 ?category=business. a replaceUrl redirect without the parameter; nothing selected', async () => {
      TestBed.configureTestingModule({ providers: [provideRouter(ROUTES), TaskDraftStore] });
      const router = TestBed.inject(Router);
      const route = { queryParamMap: router.parseUrl('/x?category=business').queryParamMap } as ActivatedRouteSnapshot;
      const state = { url: '/app/customer/new?category=business' } as RouterStateSnapshot;
      const result = TestBed.runInInjectionContext(() => wizardEntryGuard(route, state)) as RedirectCommand;
      expect(result).toBeInstanceOf(RedirectCommand);
      expect(router.serializeUrl(result.redirectTo)).toBe('/app/customer/new');
      expect(result.navigationBehaviorOptions?.replaceUrl).toBe(true);

      TestBed.resetTestingModule();
      const { go, store } = await setup();
      expect(await go('/app/customer/new?category=foo')).toBe('/app/customer/new');
      expect(store().category()).toBeNull();
    });
  });

  describe('NC§W9.7 wizardLeaveGuard', () => {
    it('NC§W9.7 no data. leaving is allowed without a dialog', async () => {
      const { go, confirm } = await setup();
      await go('/app/customer/new');
      expect(await go('/app/customer/history')).toBe('/app/customer/history');
      expect(confirm).not.toHaveBeenCalled();
    });

    it('NC§W9.7 data + Discard. the confirm with the exact copy; true resets and leaves', async () => {
      const { go, confirm, store } = await setup('/app/customer/home', true);
      await go('/app/customer/new?category=inspection');
      store().title.set('Apartment check');
      expect(await go('/app/customer/history')).toBe('/app/customer/history');
      expect(confirm).toHaveBeenCalledWith(DISCARD_CONFIRM);
      expect(DISCARD_CONFIRM).toEqual({
        title: 'Discard this task?',
        body: "What you've entered so far will be lost.",
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        destructive: true,
      });
      expect(store().hasData()).toBe(false);
      expect(store().category()).toBeNull();
    });

    it('NC§W9.7 data + Keep editing. false blocks and keeps the draft', async () => {
      const { go, confirm, store } = await setup('/app/customer/home', false);
      await go('/app/customer/new?category=inspection');
      await go('/app/customer/new/details');
      store().description.set('Check the flat');
      expect(await go('/app/customer/history')).toBe('/app/customer/new/details');
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(store().description()).toBe('Check the flat');
    });

    it('NC§W9.7 submitted. allowed without a dialog', async () => {
      const { go, confirm, store } = await setup();
      await go('/app/customer/new?category=inspection');
      store().title.set('x');
      store().submitted = true;
      expect(await go('/app/customer/tasks/e-1/quote')).toBe('/app/customer/tasks/e-1/quote');
      expect(confirm).not.toHaveBeenCalled();
    });

    it('NC§W9.7 submitting. blocked without a dialog', async () => {
      const { go, confirm, store } = await setup();
      await go('/app/customer/new?category=inspection');
      store().title.set('x');
      store().submitting.set(true);
      expect(await go('/app/customer/history')).toBe('/app/customer/new?category=inspection');
      expect(confirm).not.toHaveBeenCalled();
    });

    it('NC§W9.7 between steps. moving between two wizard steps never asks', async () => {
      const { go, confirm, store } = await setup();
      await go('/app/customer/new?category=inspection');
      store().title.set('x');
      expect(await go('/app/customer/new/details')).toBe('/app/customer/new/details');
      expect(await go('/app/customer/new')).toBe('/app/customer/new');
      expect(confirm).not.toHaveBeenCalled();
    });
  });

  describe('NC§W9.10 orphan DRAFT', () => {
    it('NC§W9.10 cancel. leaving with a created, unsubmitted DRAFT sends PATCH /errands/:id/status { to: CANCELLED } once', async () => {
      const { go, store, http } = await setup('/app/customer/home', true);
      await go('/app/customer/new?category=inspection');
      store().title.set('x');
      store().createdErrandId = 'e-9';
      expect(await go('/app/customer/history')).toBe('/app/customer/history');
      const req = http.expectOne('http://localhost:3000/api/v1/errands/e-9/status');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ to: 'CANCELLED' });
      req.flush({ errand: { id: 'e-9' } });
      http.verify();
    });

    it('NC§W9.10 failure swallowed. a failed cancel shows nothing and the leave still completes', async () => {
      const { go, store, http } = await setup('/app/customer/home', true);
      await go('/app/customer/new?category=inspection');
      store().title.set('x');
      store().createdErrandId = 'e-9';
      expect(await go('/app/customer/history')).toBe('/app/customer/history');
      http.expectOne('http://localhost:3000/api/v1/errands/e-9/status').flush({ message: 'x' }, { status: 500, statusText: 'Error' });
      await Promise.resolve();
      expect(store().createdErrandId).toBeNull();
      http.verify();
    });
  });
});
