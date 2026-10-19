export enum UserRole {
  CUSTOMER = 'customer',
  RUNNER = 'runner',
  ADMIN = 'admin',
  BUSINESS = 'business',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BANNED = 'banned',
}

export enum ErrandStatus {
  DRAFT = 'DRAFT',
  REQUESTED = 'REQUESTED',
  QUOTED = 'QUOTED',
  ACCEPTED = 'ACCEPTED',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  RUNNER_ASSIGNED = 'RUNNER_ASSIGNED',
  RUNNER_EN_ROUTE = 'RUNNER_EN_ROUTE',
  ARRIVED = 'ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  AWAITING_CUSTOMER = 'AWAITING_CUSTOMER',
  COMPLETED = 'COMPLETED',
  CONFIRMED = 'CONFIRMED',
  SETTLED = 'SETTLED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  DISPUTED = 'DISPUTED',
  EXPIRED = 'EXPIRED',
}

export enum ErrandCategory {
  BUY_FOR_ME = 'buy_for_me',
  PICKUP_DELIVERY = 'pickup_delivery',
  INSPECTION = 'inspection',
  REPRESENTATION = 'representation',
  QUEUE_ADMIN = 'queue_admin',
  BUSINESS = 'business',
}

export enum ErrandUrgency {
  STANDARD = 'standard',
  URGENT = 'urgent',
  SCHEDULED = 'scheduled',
}

export enum ErrandPointType {
  PICKUP = 'pickup',
  DROPOFF = 'dropoff',
  TASK_SITE = 'task_site',
}

export enum StatusHistoryActor {
  CUSTOMER = 'customer',
  RUNNER = 'runner',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

export enum AssignmentStatus {
  OFFERED = 'offered',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired',
  ASSIGNED = 'assigned',
}

/** Why a runner declined an assignment (rows 108, 210). */
export enum AssignmentDeclineReason {
  /** The task's required purchase is above the runner's max_purchase_advance (checked). */
  OVER_PURCHASE_LIMIT = 'over_purchase_limit',
  /** Row 210: the task is too far for the runner (not checked). */
  TOO_FAR = 'too_far',
  /** Row 210: the runner cannot take it now (not checked). */
  NOT_AVAILABLE = 'not_available',
  /** Row 210: any other reason; no free text (row 229 open). */
  OTHER = 'other',
}

export enum VerificationLevel {
  ONE_BASIC = '1_basic',
  TWO_ID_VERIFIED = '2_id_verified',
  THREE_TRUSTED = '3_trusted',
  FOUR_PROFESSIONAL = '4_professional',
}

export enum RunnerAvailability {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy',
}

export enum RunnerVerificationType {
  PHONE = 'phone',
  GOVERNMENT_ID = 'government_id',
  SELFIE = 'selfie',
  PAYMENT_IDENTITY = 'payment_identity',
  REFERENCE = 'reference',
  BUSINESS = 'business',
}

export enum VerificationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/**
 * Runner skills = the six task categories (owner row 115; migration
 * 1790103100000 from the old shopping/documents/... vocabulary). Same wire
 * values as ErrandCategory.
 */
export enum RunnerSkill {
  BUY_FOR_ME = 'buy_for_me',
  PICKUP_DELIVERY = 'pickup_delivery',
  INSPECTION = 'inspection',
  REPRESENTATION = 'representation',
  QUEUE_ADMIN = 'queue_admin',
  BUSINESS = 'business',
}

export enum DevicePlatform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

export enum PaymentFlow {
  MERCHANT_DIRECT = 'merchant_direct',
  CUSTOMER_TO_RUNNER = 'customer_to_runner',
  RUNNER_ADVANCE = 'runner_advance',
  PLATFORM_ONLY = 'platform_only',
}

export enum PaymentStatus {
  PENDING = 'pending',
  AUTHORIZED = 'authorized',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum PaymentTypeCode {
  SERVICE_FEE = 'service_fee',
  RUNNER_FEE = 'runner_fee',
  MERCHANT_PAYMENT = 'merchant_payment',
  RUNNER_ADVANCE = 'runner_advance',
}

export enum PaymentTransactionStatus {
  INITIATED = 'initiated',
  AUTHORIZED = 'authorized',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
}

export enum EvidenceType {
  PHOTO = 'photo',
  VIDEO = 'video',
  RECEIPT = 'receipt',
  DOCUMENT = 'document',
  SIGNATURE = 'signature',
}

export enum DisputeStatus {
  OPEN = 'open',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

export enum DisputeEventType {
  OPENED = 'opened',
  COMMENT = 'comment',
  EVIDENCE_ADDED = 'evidence_added',
  RESOLVED = 'resolved',
}

export enum NotificationChannel {
  PUSH = 'push',
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  EMAIL = 'email',
  SOCKET = 'socket',
}

/** Channel an OTP was issued to (phone or email address). */
export enum OtpChannel {
  PHONE = 'phone',
  EMAIL = 'email',
}

export enum NotificationSendStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  FAILED = 'failed',
  DEAD_LETTERED = 'dead_lettered',
}

/**
 * GeoJSON Point used by TypeORM for `geography(Point,4326)` columns. TypeORM
 * serializes this object with JSON.stringify on write and hydrates reads back
 * into the same shape (via ST_AsGeoJSON).
 */
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export enum ResolveDisputeVerdict {
  RUNNER = 'runner',
  CUSTOMER = 'customer',
}

export enum PaymentMethodType {
  MPESA = 'mpesa',
  CARD = 'card',
  BANK = 'bank',
}

export enum PriceChangeStatus {
  REQUESTED = 'requested',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
/**
 * Published `notifications.eventType` values (in-app feed and push `data`).
 * Clients choose icon and deep link from this value; every value refers to
 * the errand in the row's `errandId`. Status items use
 * `errand.<ErrandStatus>`; CONFIRMED and SETTLED are system-only payout
 * states and never reach the customer feed. Non-status items:
 * `price_change.requested` and `refund.<RefundStatus>` (approved,
 * no_refund, refunded).
 */
export enum NotificationEventType {
  ERRAND_QUOTED = 'errand.QUOTED',
  ERRAND_RUNNER_ASSIGNED = 'errand.RUNNER_ASSIGNED',
  ERRAND_RUNNER_EN_ROUTE = 'errand.RUNNER_EN_ROUTE',
  ERRAND_ARRIVED = 'errand.ARRIVED',
  ERRAND_IN_PROGRESS = 'errand.IN_PROGRESS',
  ERRAND_AWAITING_CUSTOMER = 'errand.AWAITING_CUSTOMER',
  ERRAND_COMPLETED = 'errand.COMPLETED',
  ERRAND_DISPUTED = 'errand.DISPUTED',
  ERRAND_CANCELLED = 'errand.CANCELLED',
  ERRAND_FAILED = 'errand.FAILED',
  /** RUNNER_ASSIGNED -> EXPIRED: no further runner can be assigned (rows 157, 158). */
  ERRAND_EXPIRED = 'errand.EXPIRED',
  PRICE_CHANGE_REQUESTED = 'price_change.requested',
  REFUND_APPROVED = 'refund.approved',
  REFUND_NO_REFUND = 'refund.no_refund',
  REFUND_REFUNDED = 'refund.refunded',
  /** Admin re-quote (N-4, row 72). */
  QUOTE_REISSUED = 'quote.reissued',
  /** Merchant Till/Paybill details set on the errand (rows 42-44). */
  MERCHANT_DETAILS_ADDED = 'merchant_details.added',
  /** Merchant details changed after a merchant-direct payment started (row 80). */
  MERCHANT_DETAILS_CHANGED = 'merchant_details.changed',
  /** Admin feed: a customer asked for a new quote after expiry (row 68). */
  QUOTE_REQUESTED = 'quote.requested',
  /** Admin feed: the runner declined, the purchase is above their limit (row 108). */
  ASSIGNMENT_DECLINED = 'assignment.declined',
  /** Admin feed: an admin offer lapsed unaccepted; the task needs another runner (row 157, N-20). */
  ASSIGNMENT_EXPIRED = 'assignment.expired',
  /** Admin feed: a RUNNER_ASSIGNED task expired at its customer deadline (row 185). */
  DEADLINE_PASSED = 'deadline_passed',
  /** Customer: the task was refused at quote, inside no service area; they may cancel (row 236). */
  OUTSIDE_SERVICE_AREA = 'service_area.outside',
}
