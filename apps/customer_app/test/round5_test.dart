import 'package:customer_app/src/screens/task/task_detail_screen.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

Future<TestBackend> open(
  WidgetTester t, {
  required ErrandStatus status,
  List<CustomerRefund> refunds = const [],
  bool paid = true,
}) async {
  final b = TestBackend();
  b.errands.put(errand(status: status, withRunner: false));
  b.payments.summary = paid
      ? PaymentSummary(payment: payment())
      : const PaymentSummary();
  b.errands.refundsValue = refunds;
  await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));
  return b;
}

void main() {
  group('row 102: refunds after an EXPIRED / FAILED paid task', () {
    testWidgets('EXPIRED with a pending review', (t) async {
      await open(
        t,
        status: ErrandStatus.expired,
        refunds: const [
          CustomerRefund(
            status: RefundStatus.pendingReview,
            trigger: RefundTrigger.expiredAfterPayment,
          ),
        ],
      );
      expect(find.text('Total (service + runner fee)'), findsOneWidget);
      expect(find.text('Not paid yet.'), findsNothing);
      expect(find.text('Refund under review'), findsOneWidget);
      expect(
        find.text(
          "We couldn't find a runner for this task in time. We're reviewing "
          'a refund and will let you know the outcome.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('FAILED with a pending review', (t) async {
      await open(
        t,
        status: ErrandStatus.failed,
        refunds: const [
          CustomerRefund(
            status: RefundStatus.pendingReview,
            trigger: RefundTrigger.failedAfterPayment,
          ),
        ],
      );
      expect(
        find.text(
          "This task couldn't be completed. We're reviewing a refund and "
          'will let you know the outcome.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('other triggers keep the common pending line', (t) async {
      await open(
        t,
        status: ErrandStatus.cancelled,
        refunds: const [
          CustomerRefund(
            status: RefundStatus.pendingReview,
            trigger: RefundTrigger.priceChangeRejected,
          ),
        ],
      );
      expect(
        find.text(
          "We're reviewing a refund for this task. We'll let you know the "
          'outcome.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('EXPIRED and never paid: nothing about refunds', (t) async {
      await open(t, status: ErrandStatus.expired, paid: false);
      expect(find.text('Not paid yet.'), findsOneWidget);
      expect(find.text('Refund'), findsNothing);
    });
  });

  testWidgets(
    'row 100: a reversed payout reads Refund approved, no Sent line',
    (t) async {
      await open(
        t,
        status: ErrandStatus.cancelled,
        refunds: const [
          CustomerRefund(
            status: RefundStatus.approved,
            refundAmount: '2200.00',
          ),
        ],
      );
      expect(find.text('Refund approved'), findsOneWidget);
      expect(find.text('Refund amount'), findsOneWidget);
      expect(find.textContaining('Sent', findRichText: true), findsNothing);
      expect(
        find.text(
          "We'll send you this refund and update this page when it's sent.",
        ),
        findsOneWidget,
      );
    },
  );
}
