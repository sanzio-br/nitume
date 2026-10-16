import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

void main() {
  test('R-01 maps every runner-visible §3.3 state (_shared.md §6)', () {
    final expected = <ErrandStatus, (String, StatusTone)>{
      ErrandStatus.paymentConfirmed: ('New offer', StatusTone.info),
      ErrandStatus.runnerAssigned: ('Accepted', StatusTone.info),
      ErrandStatus.runnerEnRoute: ('On the way', StatusTone.pending),
      ErrandStatus.arrived: ('Arrived', StatusTone.info),
      ErrandStatus.inProgress: ('In progress', StatusTone.info),
      ErrandStatus.awaitingCustomer: (
        'Waiting for the customer',
        StatusTone.pending,
      ),
      ErrandStatus.completed: ('Completed', StatusTone.success),
      ErrandStatus.confirmed: ('Completed', StatusTone.success),
      ErrandStatus.settled: ('Paid', StatusTone.success),
      ErrandStatus.cancelled: ('Cancelled', StatusTone.danger),
      ErrandStatus.failed: ('Failed', StatusTone.danger),
      ErrandStatus.expired: ('Expired', StatusTone.info),
      ErrandStatus.disputed: ('Disputed', StatusTone.danger),
    };
    expected.forEach((status, e) {
      final p = runnerStatusPresentation(status)!;
      expect((p.label, p.tone), e, reason: status.wire);
    });
  });

  test('RUNNER_ASSIGNED reads New offer until the offer is accepted', () {
    final p = runnerStatusPresentation(
      ErrandStatus.runnerAssigned,
      offerAccepted: false,
    )!;
    expect(p.label, 'New offer');
    expect(p.tone, StatusTone.info);
  });

  test('pre-payment states have no runner label', () {
    for (final s in [
      ErrandStatus.draft,
      ErrandStatus.requested,
      ErrandStatus.quoted,
      ErrandStatus.accepted,
    ]) {
      expect(runnerStatusPresentation(s), isNull, reason: s.wire);
    }
  });

  test('the customer map (C-06) is unchanged', () {
    expect(statusPresentation(ErrandStatus.runnerEnRoute).label, 'En route');
    expect(statusPresentation(ErrandStatus.settled).label, 'Completed');
  });
}
