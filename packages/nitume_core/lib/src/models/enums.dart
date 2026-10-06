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
}

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
