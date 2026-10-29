// Task categories (ui-kit spec §5.4, AGENTS.md, OA-1). Wire values stay in
// API code; UI copy uses the display names only.
import { Pipe, PipeTransform } from '@angular/core';

/** ERD enum values, in display order. */
export const ERRAND_CATEGORIES = [
  'buy_for_me',
  'pickup_delivery',
  'inspection',
  'representation',
  'queue_admin',
  'business',
] as const;

export type ErrandCategory = (typeof ERRAND_CATEGORIES)[number];

const DISPLAY_NAMES: Record<ErrandCategory, string> = {
  buy_for_me: 'Buy For Me',
  pickup_delivery: 'Get It For Me',
  inspection: 'Check It For Me',
  representation: 'Go There For Me',
  queue_admin: 'Wait For Me',
  business: 'Business Tasks',
};

/** The five categories offered to customers (Business Tasks never is, OA-18). */
export const CUSTOMER_MVP_CATEGORIES: readonly ErrandCategory[] = ERRAND_CATEGORIES.filter(
  (c) => c !== 'business',
);

/** Display name for a wire value; unknown values give an empty string. */
export function categoryName(wire: unknown): string {
  return typeof wire === 'string' && Object.prototype.hasOwnProperty.call(DISPLAY_NAMES, wire)
    ? DISPLAY_NAMES[wire as ErrandCategory]
    : '';
}

@Pipe({ name: 'categoryName' })
export class CategoryNamePipe implements PipeTransform {
  transform(wire: unknown): string {
    return categoryName(wire);
  }
}
