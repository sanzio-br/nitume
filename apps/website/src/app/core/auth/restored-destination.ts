// Where a restored (not fresh) session goes from `/app` or the `/auth`
// chooser (auth-foundation §6.4, §6.7): §6.2 with the user's own role.
import { AuthApi } from './auth-api';
import { destinationUrl, resolveDestination, roleOf } from './role-routing';
import { SessionStore } from './session.store';

/** The URL, or null when the role is not allowed (signed out instead). */
export async function restoredDestination(session: SessionStore, api: AuthApi): Promise<string | null> {
  const user = session.user();
  if (!user) return null;
  const kind = roleOf(user);
  const destination = resolveDestination({
    user,
    flowRole: kind === 'runner' ? 'runner' : 'customer',
    fresh: false,
  });
  if (destination.kind === 'refuse') {
    void session.signOut('not-allowed', 'customer');
    return null;
  }
  return destinationUrl(destination, api);
}
