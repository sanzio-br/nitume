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
      { path: 'home', title: 'Home · Nitume', data: { role, navKey: 'home', stubLabel: 'Home' }, loadComponent: stub },
      // #7 wizard: pushed; New task active from 768px.
      { path: 'new', data: { role, navKey: 'new', pushed: true }, loadComponent: stub },
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
