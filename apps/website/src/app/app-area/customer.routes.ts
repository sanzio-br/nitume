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
    data: { role, title: 'Sign in' },
    loadComponent: () => import('./sign-in/auth-phone.page').then((m) => m.AuthPhonePage),
  },
  {
    path: 'sign-in/code',
    canActivate: [guestGuard, otpStepGuard],
    data: { role, title: 'Enter the code' },
    loadComponent: () => import('./sign-in/auth-otp.page').then((m) => m.AuthOtpPage),
  },
  {
    path: 'name',
    canActivate: [authGuard, roleGuard(role), needsNameGuard],
    data: { role, title: 'Your name' },
    loadComponent: () => import('./sign-in/name-capture.page').then((m) => m.NameCapturePage),
  },
  {
    path: '',
    canActivate: [authGuard, roleGuard(role), hasNameGuard],
    data: { role },
    loadComponent: () => import('./shell/app-shell.page').then((m) => m.AppShellPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      { path: 'home', data: { role, navKey: 'home', title: 'Home', stubLabel: 'Home' }, loadComponent: stub },
      // #7 wizard: pushed; New task active from 768px.
      { path: 'new', data: { role, navKey: 'new', pushed: true }, loadComponent: stub },
      { path: 'track', data: { role, navKey: 'track', title: 'Track', stubLabel: 'Track' }, loadComponent: stub },
      {
        path: 'track/:errandId',
        data: { role, navKey: 'track', title: 'Track', stubLabel: 'Track' },
        loadComponent: stub,
      },
      {
        path: 'history',
        data: { role, navKey: 'history', title: 'History', stubLabel: 'History' },
        loadComponent: stub,
      },
      {
        path: 'profile',
        data: { role, navKey: 'profile', title: 'Profile', stubLabel: 'Profile' },
        loadComponent: stub,
      },
    ],
  },
];
