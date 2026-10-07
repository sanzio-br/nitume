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

  bool get isTerminal =>
      this == cancelled || this == failed || this == expired;

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

enum AssignmentStatus {
  offered('offered'),
  accepted('accepted'),
  declined('declined'),
  expired('expired'),
  assigned('assigned');

  const AssignmentStatus(this.wire);
  final String wire;

  static AssignmentStatus fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);
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

  static EvidenceType fromWire(String v) =>
      _fromWire(values, (e) => e.wire, v);
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
  failed('errand.FAILED', ErrandStatus.failed);

  const NotificationEventType(this.wire, this.status);
  final String wire;

  /// The errand state the notification announces.
  final ErrandStatus status;

  /// `null` for values this client does not know yet (forward compatible).
  static NotificationEventType? tryFromWire(String v) {
    for (final e in values) {
      if (e.wire == v) return e;
    }
    return null;
  }
}
