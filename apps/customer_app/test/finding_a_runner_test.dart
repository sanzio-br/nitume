import 'package:customer_app/src/screens/task/task_detail_screen.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

/// Owner rows 176, 182, 183 (`_shared.md` §6.1): during RUNNER_ASSIGNED the
/// customer sees `Finding a runner` and never the offered runner; the
/// acceptance step (RUNNER_EN_ROUTE) is titled `Runner assigned`.
///
/// Assertions hold whether the C-06 chip for RUNNER_ASSIGNED reads
/// `Runner assigned` (before CC-176) or `Finding a runner` (after).
void main() {
  const runnerPoint = GeoPoint(lat: -4.02, lng: 39.70);

  StatusHistoryEntry entry(String id, ErrandStatus to, int minute) =>
      StatusHistoryEntry(
        id: id,
        errandId: 'e1',
        toStatus: to,
        actorType: StatusHistoryActor.system,
        createdAt: fixtureAt(10, minute),
      );

  /// The API may still send the offered runner during RUNNER_ASSIGNED: the
  /// errand assignment, the tracking runner, a position and an ETA.
  TrackingSnapshot offeredTracking(ErrandStatus status) => TrackingSnapshot(
    errandId: 'e1',
    status: status,
    live: true,
    points: errand().locations ?? const [],
    runner: runner(),
    runnerLocation: const RunnerLocation(point: runnerPoint),
    eta: const Duration(minutes: 7),
  );

  Finder inTimeline(String text) => find.descendant(
    of: find.byType(StatusTimeline),
    matching: find.text(text),
  );

  Finder sectionLabel(String text) =>
      find.byWidgetPredicate((w) => w is SectionLabel && w.text == text);

  group('v-track', () {
    for (final status in [
      ErrandStatus.paymentConfirmed,
      ErrandStatus.runnerAssigned,
    ]) {
      testWidgets('${status.name}: finding a runner, no offered runner', (
        t,
      ) async {
        final rt = FakeRealtime();
        final b = TestBackend(realtime: rt);
        b.errands.put(errand(status: status));
        b.errands.trackingValue = offeredTracking(status);
        b.errands.historyValue = [
          entry('h1', ErrandStatus.paymentConfirmed, 1),
          if (status == ErrandStatus.runnerAssigned)
            entry('h2', ErrandStatus.runnerAssigned, 3),
        ];
        await b.pumpApp(t);
        await t.tap(find.text('Track'));
        await t.pumpAndSettle();

        expect(
          find.text("We're finding a runner for your task."),
          findsOneWidget,
        );
        expect(find.byType(RunnerSummaryTile), findsNothing);
        expect(find.text('Brian K.'), findsNothing);
        expect(find.textContaining('Brian'), findsNothing);
        expect(find.textContaining('ETA'), findsNothing);
        expect(find.byKey(const ValueKey('runner-dot')), findsNothing);
        expect(
          find.text('Live location appears when your runner is on the way.'),
          findsNothing,
        );

        // Live positions for the offered runner are ignored too.
        rt.emitLocation('e1', runnerPoint);
        await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('runner-dot')), findsNothing);
        expect(find.textContaining('ETA'), findsNothing);

        // Timeline: the RUNNER_ASSIGNED row is hidden; next is the
        // acceptance step.
        expect(inTimeline('Finding a runner'), findsOneWidget);
        expect(inTimeline('Runner assigned'), findsOneWidget);
        expect(inTimeline('Pending'), findsOneWidget);
      });
    }

    testWidgets('RUNNER_EN_ROUTE: step reads Runner assigned, runner shown', (
      t,
    ) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.runnerEnRoute));
      b.errands.trackingValue = offeredTracking(ErrandStatus.runnerEnRoute);
      b.errands.historyValue = [
        entry('h1', ErrandStatus.paymentConfirmed, 1),
        // Offer, lapse and re-offer: no timeline rows.
        entry('h2', ErrandStatus.runnerAssigned, 3),
        entry('h3', ErrandStatus.runnerAssigned, 6),
        entry('h4', ErrandStatus.runnerEnRoute, 12),
      ];
      await b.pumpApp(t);
      await t.tap(find.text('Track'));
      await t.pumpAndSettle();

      expect(inTimeline('Finding a runner'), findsOneWidget);
      expect(inTimeline('Runner assigned'), findsOneWidget);
      expect(inTimeline('10:12 AM'), findsOneWidget); // acceptance time
      expect(inTimeline('En route'), findsNothing);
      expect(inTimeline('Arrived'), findsOneWidget); // next expected
      expect(find.text('Brian K.'), findsOneWidget);
      expect(find.text('ETA 7 min'), findsOneWidget);
      expect(find.byKey(const ValueKey('runner-dot')), findsOneWidget);
      expect(find.text('En route'), findsWidgets); // chip (row 182)
    });
  });

  group('v-task-detail', () {
    for (final status in [
      ErrandStatus.paymentConfirmed,
      ErrandStatus.runnerAssigned,
    ]) {
      testWidgets('${status.name}: no Runner section', (t) async {
        final b = TestBackend();
        // The API still returns the offered runner's assignment.
        b.errands.put(errand(status: status));
        await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));
        await t.pumpAndSettle();
        expect(sectionLabel('Runner'), findsNothing);
        expect(find.byType(RunnerSummaryTile), findsNothing);
        expect(find.textContaining('Brian'), findsNothing);
        expect(find.text('Track live'), findsOneWidget);
      });
    }

    testWidgets('RUNNER_ASSIGNED chip uses the C-06 label', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.runnerAssigned));
      await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));
      await t.pumpAndSettle();
      expect(
        find.text(statusPresentation(ErrandStatus.runnerAssigned).label),
        findsOneWidget,
      );
    });

    testWidgets('RUNNER_EN_ROUTE: the Runner section shows', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.runnerEnRoute));
      await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));
      await t.pumpAndSettle();
      expect(sectionLabel('Runner'), findsOneWidget);
      expect(find.text('Brian K.'), findsOneWidget);
    });
  });

  group('v-home', () {
    testWidgets('RUNNER_ASSIGNED card reads Finding a runner', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.runnerAssigned));
      await b.pumpApp(t);
      await t.pumpAndSettle();
      expect(find.text('Finding a runner'), findsOneWidget);
      expect(find.textContaining('Brian'), findsNothing);
      expect(find.text('Track live →'), findsOneWidget);
    });

    testWidgets('RUNNER_EN_ROUTE card names the runner', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.runnerEnRoute));
      await b.pumpApp(t);
      await t.pumpAndSettle();
      expect(find.text('Brian K. is en route'), findsOneWidget);
    });
  });
}
