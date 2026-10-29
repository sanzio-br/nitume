// Spec helpers. jsdom resolves component styles in getComputedStyle (values
// stay `var(--nitume-…)`, which is what the kit tests assert), but it does
// not compute pseudo-elements or :focus-visible. For those, the tests read
// the CSSOM rule the component stylesheet declares.

function* allRules(list: CSSRuleList): Generator<CSSRule> {
  for (const rule of Array.from(list)) {
    yield rule;
    const nested = (rule as CSSGroupingRule).cssRules;
    if (nested) yield* allRules(nested);
  }
}

/**
 * Values of `prop` in every style rule whose selector contains all of
 * `parts` (e.g. `['.nm-btn--small', '::before']`).
 */
export function cssRuleValues(parts: string[], prop: string): string[] {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of allRules(sheet.cssRules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      if (!parts.every((p) => rule.selectorText.includes(p))) continue;
      const value = rule.style.getPropertyValue(prop);
      if (value) out.push(value.trim());
    }
  }
  return out;
}

/**
 * Values of `prop` declared by rules whose selector, without Angular's
 * `[_ngcontent-…]`/`[_nghost-…]` attributes, equals `selector`
 * (e.g. `.nm-btn--outline`, `.nm-btn:focus-visible`). Use for shorthands
 * holding `var()` (`border`, `border-color`), which jsdom does not compute.
 */
export function declared(selector: string, prop: string): string[] {
  const out: string[] = [];
  const clean = (s: string) => s.replace(/\[_ng(content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of allRules(sheet.cssRules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      const selectors = rule.selectorText.split(',').map(clean);
      if (!selectors.includes(selector)) continue;
      const value = rule.style.getPropertyValue(prop);
      if (value) out.push(value.trim());
    }
  }
  return out;
}

/** Text a screen reader reads: text nodes outside `aria-hidden` subtrees. */
export function accessibleText(el: Element): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (node instanceof Element && node.getAttribute('aria-hidden') === 'true') return;
    node.childNodes.forEach(walk);
  };
  walk(el);
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Raw text of every component stylesheet in the document, whitespace
 * removed. For values jsdom's CSSOM drops (e.g. `env(safe-area-inset-*)`).
 */
export function rawStyles(): string {
  return Array.from(document.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .join('\n')
    .replace(/\s+/g, '');
}

/** Raw colour or shadow (the #5 scan, F9.48): kept here, outside src/app/. */
export const RAW_COLOUR_OR_SHADOW = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|box-shadow/;

/** True when no component stylesheet in the document declares a shadow. */
export function noShadow(): boolean {
  return !rawStyles().includes('box-shadow');
}

/** True when the component stylesheets hold only custom-property colours (no hex, rgb(a), hsl(a) or shadow). */
export function tokensOnly(): boolean {
  return !RAW_COLOUR_OR_SHADOW.test(rawStyles());
}
