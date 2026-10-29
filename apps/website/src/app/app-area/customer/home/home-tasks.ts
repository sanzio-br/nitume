// Home task presentation (customer-v-home §Task states; Flutter
// `activeCardMeta`, `activeCardAction`, `errandTitle`). No ETA on Home
// (owner WQ-29): the meta line is the state text only.
import { categoryName } from '../../../shared/format/category';
import { ErrandStatus, customerStatus, parseErrandStatus } from '../../../shared/status/status-presentation';
import { customerLinks } from '../customer-links';
import { ErrandView } from '../data/errands.api';

export const ACTIVE_STATUSES: readonly ErrandStatus[] = [
  'REQUESTED',
  'QUOTED',
  'ACCEPTED',
  'PAYMENT_CONFIRMED',
  'RUNNER_ASSIGNED',
  'RUNNER_EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER',
];

export const FINISHED_STATUSES: readonly ErrandStatus[] = [
  'COMPLETED',
  'CONFIRMED',
  'SETTLED',
  'CANCELLED',
  'FAILED',
  'EXPIRED',
  'DISPUTED',
];

export const ACTIVE_LIMIT = 5;
export const RECENT_LIMIT = 2;

/** An errand with a known status (unknown strings are dropped; DRAFT is never listed). */
export interface HomeErrand {
  readonly id: string;
  readonly status: ErrandStatus;
  readonly view: ErrandView;
}

export function knownErrands(items: readonly ErrandView[] | null | undefined): HomeErrand[] {
  const out: HomeErrand[] = [];
  for (const view of items ?? []) {
    const status = parseErrandStatus(view?.status);
    if (status && status !== 'DRAFT') out.push({ id: view.id, status, view });
  }
  return out;
}

/** `title` when set, else the category display name (OA-15). */
export function errandTitle(view: ErrandView): string {
  return view.title?.trim() || categoryName(view.category);
}

export interface ActiveCardModel {
  readonly category: string;
  readonly reference: string | null;
  readonly title: string;
  readonly meta: string;
  readonly actionLabel: string;
  readonly actionHref: string;
}

/** The runner's short name exactly as the API sends it, else `Your runner` (row 40). */
function runnerName(view: ErrandView): string {
  return view.assignment?.runner?.shortName?.trim() || 'Your runner';
}

export function activeCard(errand: HomeErrand): ActiveCardModel {
  const { id, status, view } = errand;
  const track = { actionLabel: 'Track live →', actionHref: customerLinks.track(id) };
  let rest: Pick<ActiveCardModel, 'meta' | 'actionLabel' | 'actionHref'>;
  switch (status) {
    case 'REQUESTED':
      rest = { meta: 'Waiting for your quote', actionLabel: 'View request →', actionHref: customerLinks.awaitingQuote(id) };
      break;
    case 'QUOTED':
      rest = { meta: 'Your quote is ready', actionLabel: 'Review quote →', actionHref: customerLinks.awaitingQuote(id) };
      break;
    case 'ACCEPTED':
      // #8 adds the checkout intent to this link.
      rest = { meta: 'Pay to confirm your task', actionLabel: 'Pay now →', actionHref: customerLinks.payment(id) };
      break;
    case 'PAYMENT_CONFIRMED':
    case 'RUNNER_ASSIGNED': // Rows 176, 183: an offer is not an acceptance; never the runner's name.
      rest = { meta: 'Finding a runner', ...track };
      break;
    case 'RUNNER_EN_ROUTE':
      rest = { meta: `${runnerName(view)} is en route`, ...track };
      break;
    case 'ARRIVED':
      rest = { meta: `${runnerName(view)} has arrived`, ...track };
      break;
    case 'IN_PROGRESS':
      rest = { meta: `${runnerName(view)} is on it`, ...track };
      break;
    case 'AWAITING_CUSTOMER':
      rest = { meta: 'Ready for your review', actionLabel: 'Review evidence →', actionHref: customerLinks.evidence(id) };
      break;
    default:
      rest = { meta: customerStatus(status).label, actionLabel: 'Track live →', actionHref: customerLinks.taskDetail(id) };
  }
  return {
    category: categoryName(view.category),
    reference: view.reference?.trim() || null,
    title: errandTitle(view),
    ...rest,
  };
}

/** `Good morning` before 12:00, `Good afternoon` until 17:59, `Good evening` from 18:00 (browser local). */
export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** First word of the display name (OA-2), or null. */
export function firstName(displayName: string | null | undefined): string | null {
  const first = (displayName ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}
