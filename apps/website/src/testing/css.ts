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
