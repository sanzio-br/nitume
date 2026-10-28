// Media-query signal (web adaptation, ui-kit spec §2.7). False when
// `matchMedia` is unavailable.
import { DestroyRef, Signal, inject, signal } from '@angular/core';

export function mediaQuery(query: string): Signal<boolean> {
  const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null;
  const matches = signal(mql?.matches ?? false);
  if (mql) {
    const onChange = (event: MediaQueryListEvent) => matches.set(event.matches);
    mql.addEventListener?.('change', onChange);
    inject(DestroyRef, { optional: true })?.onDestroy(() =>
      mql.removeEventListener?.('change', onChange),
    );
  }
  return matches.asReadonly();
}

/** `$nm-bp-md`: from 768px wide. */
export const NM_BP_MD_QUERY = '(min-width: 768px)';
