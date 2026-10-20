import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

AppNotification _n(String type) => AppNotification.fromJson({
  'id': 'n1',
  'eventType': type,
  'title': 'Title from the API',
  'body': null,
  'errandId': 'e1',
  'readAt': null,
  'createdAt': '2026-10-19T08:00:00.000Z',
});

void main() {
  test('runner job kinds, new types not in the enum', () {
    const expected = {
      'errand.CANCELLED': RunnerNotificationKind.jobCancelled,
      'errand.FAILED': RunnerNotificationKind.jobFailed,
      'errand.COMPLETED': RunnerNotificationKind.jobConfirmed,
      'errand.DISPUTED': RunnerNotificationKind.jobDisputed,
      'dispute.resolved': RunnerNotificationKind.disputeResolved,
      'price_change.approved': RunnerNotificationKind.priceChangeApproved,
      'price_change.rejected': RunnerNotificationKind.priceChangeRejected,
    };
    for (final MapEntry(:key, :value) in expected.entries) {
      final n = _n(key);
      expect(n.runnerKind, value, reason: key);
      expect(n.errandId, 'e1');
    }
    for (final w in [
      RunnerNotificationEvents.disputeResolved,
      RunnerNotificationEvents.priceChangeApproved,
      RunnerNotificationEvents.priceChangeRejected,
    ]) {
      expect(NotificationEventType.tryFromWire(w), isNull, reason: w);
    }
  });

  test('other notifications have no runner kind', () {
    for (final t in [
      'errand.RUNNER_ASSIGNED',
      'errand.EXPIRED',
      'price_change.requested',
      'refund.approved',
      'something.new',
    ]) {
      expect(_n(t).runnerKind, isNull, reason: t);
    }
  });
}
