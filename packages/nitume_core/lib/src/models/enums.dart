/// Wire enums shared with the NestJS API (`apps/api/src/common/enums.ts`).
///
/// Values mirror the API exactly — keep them in sync.
library;

enum UserRole {
  customer('customer'),
  runner('runner'),
  admin('admin'),
  business('business');

  const UserRole(this.wire);

  final String wire;

  static UserRole fromWire(String value) =>
      UserRole.values.firstWhere((e) => e.wire == value);
}

enum UserStatus {
  active('active'),
  suspended('suspended'),
  banned('banned');

  const UserStatus(this.wire);

  final String wire;

  static UserStatus fromWire(String value) =>
      UserStatus.values.firstWhere((e) => e.wire == value);
}

/// The six task categories from the business plan (no open-ended task type).
///
/// [label] is the single source of category display names: the six full
/// names, never short labels (Q1 / Q-CAT, **decided**). The wire value →
/// display name pairing below (`buy_for_me | pickup_delivery | inspection |
/// representation | queue_admin | business` in that order) is still pending
/// owner confirmation (BOARD row 1); change it here only.
///
/// Business Tasks is out of MVP (Q18, decided). The enum value stays so
/// existing data still parses; customer pickers use [mvpCustomerCategories].
enum ErrandCategory {
  buyForMe('buy_for_me', 'Buy For Me'),
  getItForMe('pickup_delivery', 'Get It For Me'),
  checkItForMe('inspection', 'Check It For Me'),
  goThereForMe('representation', 'Go There For Me'),
  waitForMe('queue_admin', 'Wait For Me'),
  businessTasks('business', 'Business Tasks');

  const ErrandCategory(this.wire, this.label);

  final String wire;
  final String label;

  static ErrandCategory fromWire(String value) =>
      ErrandCategory.values.firstWhere((e) => e.wire == value);

  /// The five customer MVP categories in display order (OA-18), the name
  /// the customer specs use. Same list as [mvpCustomerCategories].
  static const List<ErrandCategory> customerMvp = mvpCustomerCategories;
}

/// The categories a customer can pick in the MVP: the six minus Business
/// Tasks (Q18, decided). [CategoryGrid] shows this list by default.
const List<ErrandCategory> mvpCustomerCategories = [
  ErrandCategory.buyForMe,
  ErrandCategory.getItForMe,
  ErrandCategory.checkItForMe,
  ErrandCategory.goThereForMe,
  ErrandCategory.waitForMe,
];

enum ErrandStatus {
  draft('DRAFT'),
  requested('REQUESTED'),
  quoted('QUOTED'),
  accepted('ACCEPTED'),
  paymentConfirmed('PAYMENT_CONFIRMED'),
  runnerAssigned('RUNNER_ASSIGNED'),
  runnerEnRoute('RUNNER_EN_ROUTE'),
  arrived('ARRIVED'),
  inProgress('IN_PROGRESS'),
  awaitingCustomer('AWAITING_CUSTOMER'),
  completed('COMPLETED'),
  confirmed('CONFIRMED'),
  settled('SETTLED'),
  cancelled('CANCELLED'),
  failed('FAILED'),
  expired('EXPIRED'),
  disputed('DISPUTED');

  const ErrandStatus(this.wire);

  final String wire;

  static ErrandStatus fromWire(String value) =>
      ErrandStatus.values.firstWhere((e) => e.wire == value);

  /// `null` for unknown or absent values.
  static ErrandStatus? tryFromWire(Object? value) {
    for (final e in values) {
      if (e.wire == value) return e;
    }
    return null;
  }

  bool get isTerminal => this == cancelled || this == failed || this == expired;

  bool get isActive => !isTerminal && this != settled;
}

enum ErrandUrgency {
  standard('standard'),
  urgent('urgent'),
  scheduled('scheduled');

  const ErrandUrgency(this.wire);

  final String wire;

  static ErrandUrgency fromWire(String value) =>
      ErrandUrgency.values.firstWhere((e) => e.wire == value);
}

/// Generic wire-enum lookup that throws a descriptive [FormatException].
T _fromWire<T extends Enum>(List<T> values, String Function(T) wire, String v) {
  for (final e in values) {
    if (wire(e) == v) return e;
  }
  throw FormatException('Unknown ${T.toString()} value', v);
}

/// `errand_locations.pointType`.
enum ErrandPointType {
  pickup('pickup'),
  dropoff('dropoff'),
  taskSite('task_site');

  const ErrandPointType(this.wire);
  final String wire;

  static ErrandPointType fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);
}

/// Who performed a status transition (`errand_status_history.actorType`).
enum StatusHistoryActor {
  customer('customer'),
  runner('runner'),
  admin('admin'),
  system('system');

  const StatusHistoryActor(this.wire);
  final String wire;

  static StatusHistoryActor fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);
}

/// `errand_assignments.status`. On the errand, an open offer is
/// [assigned] (admin offer, task RUNNER_ASSIGNED); the runner's accept
/// (RUNNER_ASSIGNED → RUNNER_EN_ROUTE) makes it [accepted]; a lapsed offer
/// is [expired] (rows 113, 141).
enum AssignmentStatus {
  offered('offered'),
  accepted('accepted'),
  declined('declined'),
  expired('expired'),
  assigned('assigned');

  const AssignmentStatus(this.wire);
  final String wire;

  /// Throws [FormatException] for unknown values; prefer [tryFromWire].
  static AssignmentStatus fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);

  /// `null` for unknown or absent values (forward compatible).
  static AssignmentStatus? tryFromWire(Object? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }

  /// True for an offer the runner can still accept or decline.
  bool get isOpenOffer => this == assigned || this == offered;
}

/// Runner verification tier. [label] is not defined in the design docs;
/// screens show "Verified" per the mockup (owner to confirm per tier).
enum VerificationLevel {
  basic('1_basic'),
  idVerified('2_id_verified'),
  trusted('3_trusted'),
  professional('4_professional');

  const VerificationLevel(this.wire);
  final String wire;

  static VerificationLevel fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);
}

enum RunnerAvailability {
  online('online'),
  offline('offline'),
  busy('busy');

  const RunnerAvailability(this.wire);
  final String wire;

  static RunnerAvailability fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);
}

enum RunnerSkill {
  shopping('shopping'),
  pickupDelivery('pickup_delivery'),
  inspection('inspection'),
  documents('documents'),
  propertyVisits('property_visits'),
  queuing('queuing'),
  businessErrands('business_errands');

  const RunnerSkill(this.wire);
  final String wire;

  static RunnerSkill fromWire(String v) => _fromWire(values, (e) => e.wire, v);
}

/// How the merchant amount is paid. Three payment flows stay separate
/// (service fee, runner fee, merchant payment); this is the merchant leg.
enum PaymentFlow {
  merchantDirect('merchant_direct'),
  customerToRunner('customer_to_runner'),
  runnerAdvance('runner_advance'),
  platformOnly('platform_only');

  const PaymentFlow(this.wire);
  final String wire;

  static PaymentFlow fromWire(String v) => _fromWire(values, (e) => e.wire, v);
}

/// How the customer pays the merchant / item amount (OA-5), sent as
/// `merchantRoute` on payment initiation and price-change approval. Runner
/// advance is never a customer option.
enum MerchantRoute {
  /// Pay the merchant's Till / Paybill directly (`PaymentFlow.merchantDirect`).
  merchantDirect('merchant_direct'),

  /// Platform-mediated (row 42): the customer pays the item amount to
  /// Nitume by M-Pesa STK and Nitume passes it on for the purchase. Never a
  /// direct customer-to-runner transfer (`PaymentFlow.customerToRunner`).
  sendToRunner('send_to_runner');

  const MerchantRoute(this.wire);
  final String wire;

  static MerchantRoute fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);

  /// `null` for unknown values.
  static MerchantRoute? tryFromWire(String? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

enum PaymentStatus {
  pending('pending'),
  authorized('authorized'),
  completed('completed'),
  failed('failed'),
  refunded('refunded');

  const PaymentStatus(this.wire);
  final String wire;

  static PaymentStatus fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);
}

enum PaymentTransactionStatus {
  initiated('initiated'),
  authorized('authorized'),
  completed('completed'),
  failed('failed'),
  reversed('reversed');

  const PaymentTransactionStatus(this.wire);
  final String wire;

  static PaymentTransactionStatus fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);
}

enum EvidenceType {
  photo('photo'),
  video('video'),
  receipt('receipt'),
  document('document'),
  signature('signature');

  const EvidenceType(this.wire);
  final String wire;

  static EvidenceType fromWire(String v) => _fromWire(values, (e) => e.wire, v);
}

enum PriceChangeStatus {
  requested('requested'),
  approved('approved'),
  rejected('rejected');

  const PriceChangeStatus(this.wire);
  final String wire;

  static PriceChangeStatus fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);
}

enum DisputeStatus {
  open('open'),
  underReview('under_review'),
  resolved('resolved'),
  rejected('rejected');

  const DisputeStatus(this.wire);
  final String wire;

  static DisputeStatus fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);
}

/// Outcome of a resolved dispute (row 79), shown to customer and runner
/// with the admin's resolution note. Unknown values parse as `null`.
enum DisputeVerdict {
  runnerFavourable('runner_favourable'),
  customerFavourable('customer_favourable');

  const DisputeVerdict(this.wire);
  final String wire;

  /// `null` for absent or unknown values (dispute still open).
  static DisputeVerdict? tryFromWire(Object? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

enum DisputeEventType {
  opened('opened'),
  comment('comment'),
  evidenceAdded('evidence_added'),
  resolved('resolved');

  const DisputeEventType(this.wire);
  final String wire;

  static DisputeEventType fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);
}

enum DevicePlatform {
  ios('ios'),
  android('android'),
  web('web');

  const DevicePlatform(this.wire);
  final String wire;

  static DevicePlatform fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);
}

/// Published `notifications.eventType` values (`errand.<STATUS>`). Every
/// value refers to the errand in the row's `errandId`. CONFIRMED and SETTLED
/// are not published (`apps/api/src/common/enums.ts`); unknown values parse
/// as `null`.
enum NotificationEventType {
  quoted('errand.QUOTED', ErrandStatus.quoted),
  runnerAssigned('errand.RUNNER_ASSIGNED', ErrandStatus.runnerAssigned),
  runnerEnRoute('errand.RUNNER_EN_ROUTE', ErrandStatus.runnerEnRoute),
  arrived('errand.ARRIVED', ErrandStatus.arrived),
  inProgress('errand.IN_PROGRESS', ErrandStatus.inProgress),
  awaitingCustomer('errand.AWAITING_CUSTOMER', ErrandStatus.awaitingCustomer),
  completed('errand.COMPLETED', ErrandStatus.completed),
  disputed('errand.DISPUTED', ErrandStatus.disputed),
  cancelled('errand.CANCELLED', ErrandStatus.cancelled),
  failed('errand.FAILED', ErrandStatus.failed),

  /// A runner asked to change the item price (`v-price-auth`).
  priceChangeRequested('price_change.requested'),

  /// Refund review outcomes (`_shared.md` §11; open `v-task-detail`).
  refundApproved('refund.approved'),
  refundNoRefund('refund.no_refund'),
  refundRefunded('refund.refunded'),

  /// An admin re-quoted the task (row 72); open the checkout
  /// (`x-awaiting-quote`).
  quoteReissued('quote.reissued'),

  /// The merchant's Till/Paybill details were added (row 43).
  merchantDetailsAdded('merchant_details.added'),

  /// The merchant's Till/Paybill details changed after the customer's
  /// merchant-direct payment started (row 80); open `x-merchant-payment`.
  merchantDetailsChanged('merchant_details.changed'),

  /// A customer asked for a new quote after expiry (row 68). Admin feed
  /// only; a customer never receives it.
  quoteRequested('quote.requested');

  const NotificationEventType(this.wire, [this.status]);
  final String wire;

  /// `errand.EXPIRED`: the task expired because no runner accepted in time
  /// (rows 141, 150). Not an enum value yet: adding one would break the
  /// apps' exhaustive switches until they gain a wildcard arm, so it parses
  /// as `null` from [tryFromWire]. Read the state with
  /// `AppNotification.announcedStatus` (gives [ErrandStatus.expired]).
  static const errandExpiredWire = 'errand.EXPIRED';

  /// The errand state the notification announces; `null` for non-status
  /// events (price change, refund).
  final ErrandStatus? status;

  /// `null` for values this client does not know yet (forward compatible).
  static NotificationEventType? tryFromWire(String v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

/// Status of an admin refund review as the customer sees it (`_shared.md`
/// §11, row 54).
enum RefundStatus {
  pendingReview('pending_review'),
  approved('approved'),
  noRefund('no_refund'),
  refunded('refunded');

  const RefundStatus(this.wire);
  final String wire;

  /// `null` for unknown values (the refund group stays hidden).
  static RefundStatus? tryFromWire(Object? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}

/// What opened a refund review (rows 37, 48, 71, 102). Unknown values parse
/// as `null`; switch with a wildcard so new server values never break a
/// client.
enum RefundTrigger {
  priceChangeRejected('price_change_rejected'),
  disputeCustomerFavourable('dispute_customer_favourable'),
  cancelledAfterPayment('cancelled_after_payment'),

  /// An approved price decrease of an already-paid amount (rows 48, 71);
  /// the review carries `priceChangeRequestId`.
  priceChangeDecrease('price_change_decrease'),

  /// The task expired after the customer had paid (row 102).
  expiredAfterPayment('expired_after_payment'),

  /// The task failed after the customer had paid (row 102).
  failedAfterPayment('failed_after_payment');

  const RefundTrigger(this.wire);
  final String wire;

  /// `null` for unknown or absent values.
  static RefundTrigger? tryFromWire(Object? v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}
