// Link helpers for the signed-in app (auth-foundation §8, §7.2).
import { Router } from '@angular/router';

/**
 * A configured external link (terms, privacy, support) or `null`. Only
 * `http:`, `https:`, `mailto:` and `tel:` are rendered; anything else
 * (empty, `javascript:`, relative) is treated as not configured (F§8).
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  const value = (url ?? '').trim();
  if (!value) return null;
  return /^(https?:\/\/|mailto:|tel:)/i.test(value) ? value : null;
}

/**
 * Follows a same-origin path through the router (no document reload) for
 * a plain left click; modified clicks keep the browser's behaviour.
 */
export function followInAppLink(event: MouseEvent, url: string, router: Router): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!url.startsWith('/') || url.startsWith('//')) return;
  event.preventDefault();
  void router.navigateByUrl(url);
}
