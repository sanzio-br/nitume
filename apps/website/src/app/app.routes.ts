import { Routes } from '@angular/router';
import { MarketingLayoutComponent } from './layout/marketing-layout.component';
import { HomeComponent } from './pages/home/home.component';
import { BusinessComponent } from './pages/business/business.component';
import { DiasporaComponent } from './pages/diaspora/diaspora.component';
import { RunnerComponent } from './pages/runner/runner.component';
import { AuthComponent } from './pages/auth/auth.component';

export const routes: Routes = [
  {
    path: '',
    component: MarketingLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', component: HomeComponent },
      { path: 'business', component: BusinessComponent },
      { path: 'diaspora', component: DiasporaComponent },
      { path: 'runner', component: RunnerComponent },
      { path: 'auth', component: AuthComponent },
    ],
  },
  // Signed-in app: lazy only, so the marketing bundle does not grow.
  { path: 'app', loadChildren: () => import('./app-area/app-area.routes').then((m) => m.APP_AREA_ROUTES) },
  { path: '**', redirectTo: '' },
];
