// Every customer path a #7 view links to (customer-v-new-category §W1), in
// one place. Paths match the #6 routes (`CUSTOMER_NAV`) and the #8 spec
// (`customer-x-awaiting-quote.md` A§1). The owning issue may move a path by
// editing this file and its stub route only. Ids are URL-encoded.
const BASE = '/app/customer';
const enc = encodeURIComponent;

export const customerLinks = {
  home: (): string => `${BASE}/home`,
  /** The wizard; `?category=<wire>` preselects a tile (mobile Q3). */
  newTask: (category?: string | null): string => (category ? `${BASE}/new?category=${enc(category)}` : `${BASE}/new`),
  newTaskDetails: (): string => `${BASE}/new/details`,
  newTaskReview: (): string => `${BASE}/new/review`,
  /** x-awaiting-quote (#8). */
  awaitingQuote: (id: string): string => `${BASE}/tasks/${enc(id)}/quote`,
  /** v-payment (#8). */
  payment: (id: string): string => `${BASE}/tasks/${enc(id)}/payment`,
  /** v-track (#9). */
  track: (id?: string | null): string => (id ? `${BASE}/track/${enc(id)}` : `${BASE}/track`),
  /** v-task-detail (#9). */
  taskDetail: (id: string): string => `${BASE}/tasks/${enc(id)}`,
  /** v-evidence-confirm (#10). */
  evidence: (id: string): string => `${BASE}/tasks/${enc(id)}/evidence`,
  history: (): string => `${BASE}/history`,
  /** v-notifications (#11). */
  notifications: (): string => `${BASE}/notifications`,
  profile: (): string => `${BASE}/profile`,
} as const;
