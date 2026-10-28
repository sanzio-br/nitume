// `/app/runner/**` (auth-foundation §2, runner-shell.md). Later issues
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

const role = 'runner';
const stub = () => import('./view-stub.component').then((m) => m.ViewStubComponent);
const signedIn = [authGuard, roleGuard(role), hasNameGuard];

export const RUNNER_ROUTES: Routes = [
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
  // #13 capture steps: full page, outside the shell (no nav).
  { path: 'onboarding/id', canActivate: signedIn, data: { role }, loadComponent: stub },
  { path: 'onboarding/selfie', canActivate: signedIn, data: { role }, loadComponent: stub },
  {
    path: '',
    canActivate: signedIn,
    data: { role },
    loadComponent: () => import('./shell/app-shell.page').then((m) => m.AppShellPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'jobs' },
      { path: 'jobs', data: { role, navKey: 'jobs', title: 'Jobs', stubLabel: 'Jobs' }, loadComponent: stub },
      {
        path: 'active',
        data: { role, navKey: 'active', title: 'Active', stubLabel: 'Active' },
        loadComponent: stub,
      },
      {
        path: 'earnings',
        data: { role, navKey: 'earnings', title: 'Earnings', stubLabel: 'Earnings' },
        loadComponent: stub,
      },
      {
        path: 'profile',
        data: { role, navKey: 'profile', title: 'Profile', stubLabel: 'Profile' },
        loadComponent: stub,
      },
      // #13: pushed over Jobs inside the shell (back → jobs).
      { path: 'onboarding/pending', data: { role, navKey: 'jobs', pushed: true }, loadComponent: stub },
    ],
  },
];
