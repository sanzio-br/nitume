import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { AdminDashboardComponent } from './features/admin/admin-dashboard.component';
import { adminOnlyGuard, authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: AdminDashboardComponent,
    canActivate: [authGuard, adminOnlyGuard],
  },
  { path: '**', redirectTo: '' },
];
