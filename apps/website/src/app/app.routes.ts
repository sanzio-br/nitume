import { Routes } from '@angular/router';
import { MarketingLayoutComponent } from './layout/marketing-layout.component';
import { HomeComponent } from './pages/home/home.component';
import { BusinessComponent } from './pages/business/business.component';
import { DiasporaComponent } from './pages/diaspora/diaspora.component';
import { RunnerComponent } from './pages/runner/runner.component';

export const routes: Routes = [
  {
    path: '',
    component: MarketingLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', component: HomeComponent },
      { path: 'business', component: BusinessComponent },
      { path: 'diaspora', component: DiasporaComponent },
      { path: 'runner', component: RunnerComponent },
    ],
  },
  // WQ-12: the role chooser replaces the old /auth page; no marketing frame.
  {
    path: 'auth',
    title: 'Sign in · Nitume',
    loadComponent: () => import('./pages/auth-chooser/auth-chooser.page').then((m) => m.AuthChooserPage),
  },
  // Signed-in app: lazy only, so the marketing bundle does not grow.
  { path: 'app', loadChildren: () => import('./app-area/app-area.routes').then((m) => m.APP_AREA_ROUTES) },
  { path: '**', redirectTo: '' },
];
