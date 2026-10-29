import type { RunnerListItem } from '../../core/api-types';

/**
 * Web runner presence rules (#36, spec runner-web-presence §3), shared by
 * the runners panel, the runner drawer and the live map.
 */
type Runner = Pick<RunnerListItem, 'availability' | 'presence' | 'lastPingAt'>;

/** The runner's last socket or ping came from the website. */
export function isWeb(r: Runner): boolean {
  return r.presence?.client === 'web';
}

/** Online or on a task. */
export function isActive(r: Runner): boolean {
  return r.availability === 'online' || r.availability === 'busy';
}

/**
 * `Pings stopped`: an active web runner with a stop time. Checked on the
 * client too, because the API clears the flag silently on offline; never
 * for an app runner or a runner with no presence record.
 */
export function isFlagged(r: Runner): boolean {
  return isWeb(r) && isActive(r) && !!r.presence?.webPingsStoppedAt;
}

/** Last ping: the presence time (every ping) wins over the profile time (job pings). */
export function lastPing(r: Runner): string | null {
  return r.presence?.lastPingAt ?? r.lastPingAt ?? null;
}
