// Customer and runner shells (customer-shell.md, runner-shell.md): the same
// `nm-app-shell` configured by route `data.role`; realtime connects once on
// first render. The shell asks for no location permission (#15 decides).
import { AfterViewInit, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { routeRole } from '../../core/auth/guards';
import { ROLE_HOME } from '../../core/auth/role-routing';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { NavItem } from '../../shared/ui/app-nav/app-nav.component';
import { NmAppShell } from '../../shared/ui/app-shell/app-shell.component';
import { wordmarkSuffix } from '../sign-in/sign-in-copy';

export const CUSTOMER_NAV: readonly NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home', activeIcon: 'home-filled', link: '/app/customer/home' },
  // The app has no filled variant for New task.
  { key: 'new', label: 'New task', icon: 'add-circle', activeIcon: 'add-circle', link: '/app/customer/new' },
  { key: 'track', label: 'Track', icon: 'location', activeIcon: 'location-filled', link: '/app/customer/track' },
  { key: 'history', label: 'History', icon: 'history', activeIcon: 'history', link: '/app/customer/history' },
  { key: 'profile', label: 'Profile', icon: 'person', activeIcon: 'person-filled', link: '/app/customer/profile' },
];

export const RUNNER_NAV: readonly NavItem[] = [
  { key: 'jobs', label: 'Jobs', icon: 'work', activeIcon: 'work-filled', link: '/app/runner/jobs' },
  { key: 'active', label: 'Active', icon: 'visibility', activeIcon: 'visibility-filled', link: '/app/runner/active' },
  {
    key: 'earnings',
    label: 'Earnings',
    icon: 'add-circle',
    activeIcon: 'add-circle-filled',
    link: '/app/runner/earnings',
  },
  { key: 'profile', label: 'Profile', icon: 'person', activeIcon: 'person-filled', link: '/app/runner/profile' },
];

@Component({
  selector: 'app-shell-page',
  imports: [NmAppShell, RouterOutlet],
  template: `
    <nm-app-shell [items]="items" [wordmarkSuffix]="suffix" [homeLink]="home">
      <router-outlet />
    </nm-app-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellPage implements AfterViewInit {
  private readonly role = routeRole(inject(ActivatedRoute).snapshot);
  protected readonly items = this.role === 'runner' ? RUNNER_NAV : CUSTOMER_NAV;
  protected readonly suffix = wordmarkSuffix(this.role);
  protected readonly home = ROLE_HOME[this.role];

  private readonly realtime = inject(RealtimeService);

  /** Once, when the shell first renders (not on tab changes). */
  ngAfterViewInit(): void {
    void this.realtime.connect();
  }
}
