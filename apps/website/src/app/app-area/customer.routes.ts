// `/app/customer/**` (auth-foundation §2, customer-shell.md). Later issues
// replace the ViewStubComponent routes with their views.
import { Routes } from '@angular/router';
import {
  authGuard,
  guestGuard,
  hasNameGuard,
  needsNameGuard,
  otpStepGuard,
  roleGuard,
} from '../core/auth/guards';
import { TaskDraftStore } from './customer/new-task/task-draft.store';
import { wizardEntryGuard, wizardLeaveGuard, wizardStepGuard } from './customer/new-task/wizard.guards';

const role = 'customer';
const stub = () => import('./view-stub.component').then((m) => m.ViewStubComponent);

export const CUSTOMER_ROUTES: Routes = [
  {
    path: 'sign-in',
    canActivate: [guestGuard],
    title: 'Sign in · Nitume',
    data: { role },
    loadComponent: () => import('./sign-in/auth-phone.page').then((m) => m.AuthPhonePage),
  },
  {
    path: 'sign-in/code',
    canActivate: [guestGuard, otpStepGuard],
    title: 'Enter the code · Nitume',
    data: { role },
    loadComponent: () => import('./sign-in/auth-otp.page').then((m) => m.AuthOtpPage),
  },
  {
    path: 'name',
    canActivate: [authGuard, roleGuard(role), needsNameGuard],
    title: 'Your name · Nitume',
    data: { role },
    loadComponent: () => import('./sign-in/name-capture.page').then((m) => m.NameCapturePage),
  },
  {
    path: '',
    canActivate: [authGuard, roleGuard(role), hasNameGuard],
    data: { role },
    loadComponent: () => import('./shell/app-shell.page').then((m) => m.AppShellPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        title: 'Home · Nitume',
        data: { role, navKey: 'home' },
        loadComponent: () => import('./customer/home/home.page').then((m) => m.HomePage),
      },
      // #7 task wizard (customer-v-new-category §W1): one draft for the three
      // steps; pushed, New task active from 768px (WQ-15, WQ-16).
      {
        path: 'new',
        data: { role, navKey: 'new', pushed: true },
        providers: [TaskDraftStore],
        canActivate: [wizardEntryGuard],
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: 'New task · Nitume',
            canDeactivate: [wizardLeaveGuard],
            loadComponent: () => import('./customer/new-task/new-category.page').then((m) => m.NewCategoryPage),
          },
          {
            path: 'details',
            title: 'Task details · Nitume',
            canActivate: [wizardStepGuard(2)],
            canDeactivate: [wizardLeaveGuard],
            loadComponent: () => import('./customer/new-task/new-details.page').then((m) => m.NewDetailsPage),
          },
          {
            path: 'review',
            title: 'Review · Nitume',
            canActivate: [wizardStepGuard(3)],
            canDeactivate: [wizardLeaveGuard],
            loadComponent: () => import('./customer/new-task/new-review.page').then((m) => m.NewReviewPage),
          },
        ],
      },
      { path: 'track', title: 'Track · Nitume', data: { role, navKey: 'track', stubLabel: 'Track' }, loadComponent: stub },
      {
        path: 'track/:errandId',
        title: 'Track · Nitume',
        data: { role, navKey: 'track', stubLabel: 'Track' },
        loadComponent: stub,
      },
      {
        path: 'history',
        title: 'History · Nitume',
        data: { role, navKey: 'history', stubLabel: 'History' },
        loadComponent: stub,
      },
      {
        path: 'profile',
        title: 'Profile · Nitume',
        data: { role, navKey: 'profile', stubLabel: 'Profile' },
        loadComponent: stub,
      },
      // #7 stubs for the targets of Home and the wizard (customerLinks,
      // customer-v-new-category §W1). Each owning issue replaces its stub.
      { path: 'tasks/:errandId', data: { role, navKey: 'home', pushed: true }, loadComponent: stub }, // #9
      { path: 'tasks/:errandId/quote', data: { role, navKey: 'home', pushed: true }, loadComponent: stub }, // #8
      { path: 'tasks/:errandId/payment', data: { role, navKey: 'home', pushed: true }, loadComponent: stub }, // #8
      { path: 'tasks/:errandId/evidence', data: { role, navKey: 'home', pushed: true }, loadComponent: stub }, // #10
      { path: 'notifications', data: { role, navKey: 'home', pushed: true }, loadComponent: stub }, // #11
    ],
  },
];
