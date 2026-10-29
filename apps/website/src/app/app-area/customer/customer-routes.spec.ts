// NC§W9.1 (G7-1): Home and the wizard replace the #6 stubs.
import { Route } from '@angular/router';
import { draftOf, openCustomer } from '../../../testing/customer';
import { CUSTOMER_ROUTES } from '../customer.routes';
import { HomePage } from './home/home.page';
import { NewCategoryPage } from './new-task/new-category.page';
import { NewDetailsPage } from './new-task/new-details.page';
import { NewReviewPage } from './new-task/new-review.page';
import { TaskDraftStore } from './new-task/task-draft.store';
import { wizardEntryGuard, wizardLeaveGuard } from './new-task/wizard.guards';

const shell = (): Route[] => CUSTOMER_ROUTES.find((r) => r.path === '' && r.children)?.children ?? [];
const child = (path: string) => shell().find((r) => r.path === path) as Route;
const load = async (route: Route) => (await (route.loadComponent as () => Promise<unknown>)()) as unknown;

describe('customer routes (NC§W9.1)', () => {
  it('NC§W9.1 new. a componentless parent providing TaskDraftStore, wizardEntryGuard, navKey new, pushed; three lazy children with their titles and guards', async () => {
    const wizard = child('new');
    expect(wizard.component).toBeUndefined();
    expect(wizard.loadComponent).toBeUndefined();
    expect(wizard.providers).toEqual([TaskDraftStore]);
    expect(wizard.canActivate).toEqual([wizardEntryGuard]);
    expect(wizard.data).toEqual({ role: 'customer', navKey: 'new', pushed: true });
    const [step1, step2, step3] = wizard.children ?? [];
    expect([step1.path, step2.path, step3.path]).toEqual(['', 'details', 'review']);
    expect([step1.title, step2.title, step3.title]).toEqual(['New task · Nitume', 'Task details · Nitume', 'Review · Nitume']);
    expect(step1.canActivate).toBeUndefined();
    expect(step2.canActivate).toHaveLength(1);
    expect(step3.canActivate).toHaveLength(1);
    for (const step of [step1, step2, step3]) expect(step.canDeactivate).toEqual([wizardLeaveGuard]);
    expect(await load(step1)).toBe(NewCategoryPage);
    expect(await load(step2)).toBe(NewDetailsPage);
    expect(await load(step3)).toBe(NewReviewPage);
  });

  it('NC§W9.1 titles. read through the default TitleStrategy after navigation', async () => {
    const h = await openCustomer('/app/customer/new?category=inspection');
    expect(document.title).toBe('New task · Nitume');
    const store = draftOf(h, NewCategoryPage);
    await h.harness.navigateByUrl('/app/customer/new/details');
    expect(document.title).toBe('Task details · Nitume');
    store.description.set('Check the apartment');
    store.first.set({ addressText: 'Nyali', lat: -4, lng: 39.7, placeId: 'p' });
    store.detailsValidated = true;
    await h.harness.navigateByUrl('/app/customer/new/review');
    expect(document.title).toBe('Review · Nitume');
  });

  it('NC§W9.1 home. Home · Nitume, navKey home, no stubLabel, loads HomePage (not ViewStubComponent)', async () => {
    const home = child('home');
    expect(home.title).toBe('Home · Nitume');
    expect(home.data).toEqual({ role: 'customer', navKey: 'home' });
    expect(await load(home)).toBe(HomePage);
    const h = await openCustomer('/app/customer/home');
    expect(document.title).toBe('Home · Nitume');
    expect(h.root().querySelector('app-home-page')).not.toBeNull();
    expect(h.root().querySelector('app-view-stub')).toBeNull();
  });
});
