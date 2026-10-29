// Terms, privacy and support links per role (auth-foundation §8). A token
// so tests can configure them; the default is `environment.links`.
import { InjectionToken } from '@angular/core';
import { AppLinks, environment } from '../../environments/environment';
import type { AppRole } from '../core/auth/auth.tokens';

export const APP_LINKS = new InjectionToken<Readonly<Record<AppRole, AppLinks>>>('APP_LINKS', {
  providedIn: 'root',
  factory: () => environment.links,
});
