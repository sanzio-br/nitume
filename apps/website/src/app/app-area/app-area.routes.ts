// The lazy `/app` tree (auth-foundation §2). Customer and runner trees are
// separate lazy chunks.
import { Routes } from '@angular/router';
import { AppAreaComponent } from './app-area.component';

export const APP_AREA_ROUTES: Routes = [
  {
    path: '',
    component: AppAreaComponent,
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./app-entry.page').then((m) => m.AppEntryPage) },
      {
        path: 'offline',
        loadComponent: () => import('./restore-failed.page').then((m) => m.RestoreFailedPage),
      },
      { path: 'customer', loadChildren: () => import('./customer.routes').then((m) => m.CUSTOMER_ROUTES) },
      { path: 'runner', loadChildren: () => import('./runner.routes').then((m) => m.RUNNER_ROUTES) },
      { path: '**', redirectTo: '/app' },
    ],
  },
];
