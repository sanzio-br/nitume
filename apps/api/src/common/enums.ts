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

export enum RunnerSkill {
  SHOPPING = 'shopping',
  PICKUP_DELIVERY = 'pickup_delivery',
  INSPECTION = 'inspection',
  DOCUMENTS = 'documents',
  PROPERTY_VISITS = 'property_visits',
  QUEUING = 'queuing',
  BUSINESS_ERRANDS = 'business_errands',
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