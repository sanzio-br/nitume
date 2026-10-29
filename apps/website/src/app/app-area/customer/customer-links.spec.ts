// NC§W9.11: customerLinks and the #7 stub routes (customer-v-new-category §W1).
import { Route } from '@angular/router';
import { userJson } from '../../../testing/auth';
import { openApp } from '../../../testing/app-harness';
import { CUSTOMER_ROUTES } from '../customer.routes';
import { customerLinks } from './customer-links';

const shellChildren = (): Route[] => CUSTOMER_ROUTES.find((r) => r.path === '' && r.children)?.children ?? [];

describe('customerLinks (NC§W9.11)', () => {
  it('NC§W9.11 paths. returns exactly the §W1 paths, ids URL-encoded', () => {
    expect(customerLinks.home()).toBe('/app/customer/home');
    expect(customerLinks.newTask()).toBe('/app/customer/new');
    expect(customerLinks.newTask('inspection')).toBe('/app/customer/new?category=inspection');
    expect(customerLinks.newTaskDetails()).toBe('/app/customer/new/details');
    expect(customerLinks.newTaskReview()).toBe('/app/customer/new/review');
    expect(customerLinks.awaitingQuote('e-1')).toBe('/app/customer/tasks/e-1/quote');
    expect(customerLinks.payment('e 1/2')).toBe('/app/customer/tasks/e%201%2F2/payment');
    // #8 (A.T1): the item payment.
    expect(customerLinks.itemPayment('a/b')).toBe('/app/customer/tasks/a%2Fb/item-payment');
    expect(customerLinks.track()).toBe('/app/customer/track');
    expect(customerLinks.track('e-1')).toBe('/app/customer/track/e-1');
    expect(customerLinks.taskDetail('e-1')).toBe('/app/customer/tasks/e-1');
    expect(customerLinks.evidence('e-1')).toBe('/app/customer/tasks/e-1/evidence');
    expect(customerLinks.history()).toBe('/app/customer/history');
    expect(customerLinks.notifications()).toBe('/app/customer/notifications');
    expect(customerLinks.profile()).toBe('/app/customer/profile');
  });

  it('NC§W9.11 stubs. the #7 stub routes still owned by later issues use ViewStubComponent, pushed, navKey home, no stubLabel and no title', async () => {
    // #8 replaced the quote and payment stubs (A.T1, customer-routes.spec.ts).
    const paths = ['tasks/:errandId', 'tasks/:errandId/evidence', 'notifications'];
    for (const path of paths) {
      const route = shellChildren().find((r) => r.path === path);
      expect.soft(route, path).toBeDefined();
      expect.soft(route?.data, path).toEqual({ role: 'customer', navKey: 'home', pushed: true });
      expect.soft(route?.title, path).toBeUndefined();
      const component = await (route?.loadComponent as () => Promise<{ name: string }>)();
      expect.soft(component.name, path).toMatch(/ViewStubComponent/);
    }
  });

  it('NC§W9.11 recognised. every returned path resolves to a customer route, never the /app/** redirect', async () => {
    const h = await openApp('/app/customer/home', { restore: userJson({ role: 'customer' }) });
    const targets = [
      customerLinks.home(),
      customerLinks.awaitingQuote('e-1'),
      customerLinks.payment('e-1'),
      customerLinks.itemPayment('e-1'), // #8
      customerLinks.track(),
      customerLinks.track('e-1'),
      customerLinks.taskDetail('e-1'),
      customerLinks.evidence('e-1'),
      customerLinks.history(),
      customerLinks.notifications(),
      customerLinks.profile(),
      customerLinks.newTask(),
    ];
    for (const url of targets) {
      await h.harness.navigateByUrl(url);
      await h.detect();
      expect.soft(h.router.url, url).toBe(url);
    }
    // The later wizard steps resolve to the wizard (step 1 without a draft), never the /app/** redirect.
    for (const url of [customerLinks.newTaskDetails(), customerLinks.newTaskReview(), customerLinks.newTask('inspection')]) {
      await h.harness.navigateByUrl(customerLinks.home());
      await h.harness.navigateByUrl(url);
      await h.detect();
      expect.soft(h.router.url.startsWith('/app/customer/new'), url).toBe(true);
    }
  });
});
