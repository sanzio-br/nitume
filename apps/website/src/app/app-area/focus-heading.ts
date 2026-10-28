// Focus rule of auth-foundation §7.3: after a navigation, focus moves to the
// page's h1 (tabindex -1, no ring on programmatic focus) unless the page
// already focused one of its own controls (e.g. the code field).
export function focusPageHeading(host: HTMLElement): void {
  const active = host.ownerDocument.activeElement;
  if (active && active !== host.ownerDocument.body && host.contains(active)) return;
  const heading = host.querySelector('h1');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
}
