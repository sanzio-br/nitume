import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

AppNotification _n(String eventType) => AppNotification.fromJson({
  'id': 'n1',
  'eventType': eventType,
  'title': 'Task update',
  'errandId': 'e1',
  'readAt': null,
  'createdAt': '2026-10-16T08:00:00.000Z',
});

void main() {
  test('errand.EXPIRED parses tolerantly and announces EXPIRED', () {
    final n = _n(NotificationEventType.errandExpiredWire);
    expect(NotificationEventType.errandExpiredWire, 'errand.EXPIRED');
    expect(n.event, isNull);
    expect(n.announcedStatus, ErrandStatus.expired);
    expect(n.errandId, 'e1');
  });

  test('typed status events announce their state', () {
    expect(_n('errand.CANCELLED').event, NotificationEventType.cancelled);
    expect(_n('errand.CANCELLED').announcedStatus, ErrandStatus.cancelled);
    expect(
      _n('errand.RUNNER_ASSIGNED').announcedStatus,
      ErrandStatus.runnerAssigned,
    );
  });

  test('non-status and unknown events announce nothing', () {
    expect(_n('price_change.requested').announcedStatus, isNull);
    expect(_n('refund.approved').announcedStatus, isNull);
    expect(_n('errand.SOMETHING_NEW').announcedStatus, isNull);
    expect(_n('errand.SOMETHING_NEW').event, isNull);
    expect(_n('payout.paid').announcedStatus, isNull);
  });

  test('service_area.outside parses tolerantly (rows 236, 241)', () {
    final n = _n(NotificationEventType.outsideServiceAreaWire);
    expect(
      NotificationEventType.outsideServiceAreaWire,
      'service_area.outside',
    );
    expect(n.isOutsideServiceArea, isTrue);
    // Not an enum value: existing exhaustive switches keep compiling and
    // fall to their null arm unless the app checks the flag first.
    expect(n.event, isNull);
    expect(NotificationEventType.tryFromWire('service_area.outside'), isNull);
    expect(n.announcedStatus, isNull);
    expect(n.errandId, 'e1');
    expect(_n('errand.QUOTED').isOutsideServiceArea, isFalse);
  });
}
