import { Component, computed, input } from '@angular/core';

/**
 * Numeric tokens inside UI copy: amounts (`KSh 1,250.50`), formatted
 * date/times (`Today, 4:30 PM`, `Mon 12 Oct, 4:30 PM`), task ids
 * (`#NT-10482`), receipts in upper case with digits, plain numbers.
 */
const NUMERIC = new RegExp(
  [
    String.raw`KSh\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?`,
    String.raw`(?:Today|Yesterday|[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}), \d{1,2}:\d{2} [AP]M`,
    String.raw`#NT-[A-Z0-9]+`,
    String.raw`\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{6,}\b`,
    String.raw`\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b`,
    String.raw`\b\d+(?:\.\d+)?\b`,
  ].join('|'),
  'g',
);

export interface TextPart {
  text: string;
  num: boolean;
}

export function splitNumeric(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(NUMERIC)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i), num: false });
    parts.push({ text: m[0], num: true });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), num: false });
  return parts;
}

/**
 * Renders copy with its numeric data in Fira Code and the rest in Fira Sans
 * (design system: Fira Code for numeric data only), e.g. notices and dialog
 * titles that embed amounts and times.
 */
@Component({
  selector: 'app-num-text',
  imports: [],
  // prettier-ignore
  template: `@for (p of parts(); track $index) {@if (p.num) {<span class="num">{{ p.text }}</span>} @else {{{ p.text }}}}`,
  styles: [],
})
export class NumTextComponent {
  readonly text = input<string>('');
  /**
   * Explicit parts, for data the numeric pattern can't be trusted to catch
   * (e.g. a 4-character or all-letter M-Pesa code). Wins over `text`.
   */
  readonly explicit = input<TextPart[] | null>(null, { alias: 'parts' });
  protected readonly parts = computed(() => this.explicit() ?? splitNumeric(this.text()));
}
