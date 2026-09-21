import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { BusinessComponent } from './pages/business/business.component';
import { DiasporaComponent } from './pages/diaspora/diaspora.component';
import { RunnerComponent } from './pages/runner/runner.component';
import { AuthComponent } from './pages/auth/auth.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'business', component: BusinessComponent },
  { path: 'diaspora', component: DiasporaComponent },
  { path: 'runner', component: RunnerComponent },
  { path: 'auth', component: AuthComponent },
  { path: '**', redirectTo: '' },
];