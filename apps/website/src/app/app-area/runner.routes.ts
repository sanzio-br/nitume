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
    title: 'Sign in · Nitume Runner',
    data: { role },
    loadComponent: () => import('./sign-in/auth-phone.page').then((m) => m.AuthPhonePage),
  },
  {
    path: 'sign-in/code',
    canActivate: [guestGuard, otpStepGuard],
    title: 'Enter the code · Nitume Runner',
    data: { role },
    loadComponent: () => import('./sign-in/auth-otp.page').then((m) => m.AuthOtpPage),
  },
  {
    path: 'name',
    canActivate: [authGuard, roleGuard(role), needsNameGuard],
    title: 'Your name · Nitume Runner',
    data: { role },
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
      { path: 'jobs', title: 'Jobs · Nitume Runner', data: { role, navKey: 'jobs', stubLabel: 'Jobs' }, loadComponent: stub },
      {
        path: 'active',
        title: 'Active · Nitume Runner',
        data: { role, navKey: 'active', stubLabel: 'Active' },
        loadComponent: stub,
      },
      {
        path: 'earnings',
        title: 'Earnings · Nitume Runner',
        data: { role, navKey: 'earnings', stubLabel: 'Earnings' },
        loadComponent: stub,
      },
      {
        path: 'profile',
        title: 'Profile · Nitume Runner',
        data: { role, navKey: 'profile', stubLabel: 'Profile' },
        loadComponent: stub,
      },
      // #13: pushed over Jobs inside the shell (back → jobs).
      { path: 'onboarding/pending', data: { role, navKey: 'jobs', pushed: true }, loadComponent: stub },
    ],
  },
];
