import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

class _ThrowingFlag implements OneTimeFlag {
  @override
  Future<bool> isSet() async => throw StateError('store');

  @override
  Future<void> set() async => throw StateError('store');
}

Widget _opener(OneTimeFlag flag, List<bool> results) => Builder(
  builder: (context) => TextButton(
    onPressed: () async =>
        results.add(await JobStartLocationNotice.showOnce(context, shown: flag)),
    child: const Text('accept'),
  ),
);

void main() {
  test('row 246 wording, exact', () {
    expect(
      RunnerLocationCopy.disclosureBody2,
      'During a job we keep sharing it when you switch apps or lock your '
      'phone, until you finish the task or go offline. If you close the app '
      'completely, or your phone stops it to save battery, sharing stops '
      'until you open the app again.',
    );
    expect(
      RunnerLocationCopy.jobStartNoticeTitle,
      'Sharing your location during jobs',
    );
    expect(
      RunnerLocationCopy.jobStartNoticeBody,
      "While you're on a job, Nitume Runner shares your location with the "
      'customer, also when you switch apps or lock your phone. It stops when '
      'you finish the task or go offline. If you close the app completely, '
      'or your phone stops it to save battery, sharing stops until you open '
      'the app again.',
    );
    expect(RunnerLocationCopy.jobStartNoticeOk, 'OK');
    expect(RunnerLocationCopy.disclosureBody2, isNot(contains('closed')));
  });

  testWidgets('shows once per install; OK closes it', (tester) async {
    final flag = MemoryOneTimeFlag();
    final results = <bool>[];
    await pumpThemed(tester, _opener(flag, results));

    await tester.tap(find.text('accept'));
    await tester.pumpAndSettle();
    expect(find.text(RunnerLocationCopy.jobStartNoticeTitle), findsOneWidget);
    expect(find.text(RunnerLocationCopy.jobStartNoticeBody), findsOneWidget);
    expect(find.widgetWithText(NitumeButton, 'OK'), findsOneWidget);
    expect(await flag.isSet(), isTrue);

    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(find.text(RunnerLocationCopy.jobStartNoticeTitle), findsNothing);
    expect(results, [true]);

    await tester.tap(find.text('accept'));
    await tester.pumpAndSettle();
    expect(find.text(RunnerLocationCopy.jobStartNoticeTitle), findsNothing);
    expect(results, [true, false]);
  });

  testWidgets('an unreadable flag still shows the notice, never throws', (
    tester,
  ) async {
    final results = <bool>[];
    await pumpThemed(tester, _opener(_ThrowingFlag(), results));
    await tester.tap(find.text('accept'));
    await tester.pumpAndSettle();
    expect(find.text(RunnerLocationCopy.jobStartNoticeTitle), findsOneWidget);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(results, [true]);
  });

  testWidgets('title takes focus when the notice opens', (tester) async {
    final results = <bool>[];
    await pumpThemed(tester, _opener(MemoryOneTimeFlag(), results));
    await tester.tap(find.text('accept'));
    await tester.pumpAndSettle();
    final focus = tester.widget<Focus>(
      find
          .ancestor(
            of: find.text(RunnerLocationCopy.jobStartNoticeTitle),
            matching: find.byType(Focus),
          )
          .first,
    );
    expect(focus.autofocus, isTrue);
  });
}
