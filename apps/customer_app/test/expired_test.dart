import 'package:customer_app/src/screens/wizard/category_screen.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

/// Owner 2026-10-16: EXPIRED copy and the `Start a new task` next action
/// (`v-track.md`, `v-task-detail.md`, `_shared.md` §6).
void main() {
  group('v-track: EXPIRED status card', () {
    Future<TestBackend> openExpired(WidgetTester t) async {
      final rt = FakeRealtime();
      final b = TestBackend(realtime: rt);
      b.errands.put(errand(status: ErrandStatus.runnerAssigned));
      await b.pumpApp(t);
      await t.tap(find.text('Track'));
      await t.pumpAndSettle();
      // No runner accepted in time: the selected errand expires.
      b.errands.put(errand(status: ErrandStatus.expired));
      rt.emitStatus('e1', ErrandStatus.expired);
      await t.pumpAndSettle();
      return b;
    }

    testWidgets('shows the copy, View task and Start a new task', (t) async {
      await openExpired(t);
      expect(find.text('Expired'), findsOneWidget);
      expect(
        find.text('No runner accepted your task in time.'),
        findsOneWidget,
      );
      expect(find.text('No runner was available in time.'), findsNothing);
      expect(find.text('View task'), findsOneWidget);
      expect(find.text('Start a new task'), findsOneWidget);
      // No refund wording on the Track card (row 102: Task detail only).
      expect(find.textContaining('refund'), findsNothing);
      expect(find.textContaining('Refund'), findsNothing);
    });

    testWidgets('Start a new task opens v-new-category', (t) async {
      await openExpired(t);
      await t.tap(find.text('Start a new task'));
      await t.pumpAndSettle();
      expect(find.byType(CategoryScreen), findsOneWidget);
      expect(find.text('New task'), findsOneWidget);
    });

    testWidgets('other terminal states have no Start a new task', (t) async {
      final rt = FakeRealtime();
      final b = TestBackend(realtime: rt);
      b.errands.put(errand(status: ErrandStatus.runnerEnRoute));
      await b.pumpApp(t);
      await t.tap(find.text('Track'));
      await t.pumpAndSettle();
      b.errands.put(errand(status: ErrandStatus.failed));
      rt.emitStatus('e1', ErrandStatus.failed);
      await t.pumpAndSettle();
      expect(find.text("This task couldn't be completed."), findsOneWidget);
      expect(find.text('Start a new task'), findsNothing);
    });
  });
}
