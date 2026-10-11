import 'package:customer_app/src/screens/task/task_detail_screen.dart';
import 'package:customer_app/src/util/display.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

Evidence photo(String id, {DateTime? expires}) => Evidence(
  id: id,
  errandId: 'e1',
  type: EvidenceType.photo,
  // No network image in tests; the expiry alone triggers the re-fetch.
  urlExpiresAt: expires,
  capturedAt: DateTime(2026, 10, 7, 10, 41),
);

void main() {
  test('fallback title is the category display name (row 41)', () {
    expect(errandTitle(errand(title: null)), 'Check It For Me');
    expect(errandTitle(errand(title: 'Flat check')), 'Flat check');
  });

  testWidgets('expired signed links are re-fetched before viewing', (t) async {
    final b = TestBackend();
    b.errands.put(errand(status: ErrandStatus.completed));
    b.evidence.items = [
      photo(
        'ev1',
        expires: DateTime.now().subtract(const Duration(minutes: 1)),
      ),
    ];
    await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));
    final before = b.evidence.calls;
    await t.tap(find.byType(EvidenceTile));
    await t.pumpAndSettle();
    expect(b.evidence.calls, before + 1);
    expect(find.byType(EvidenceViewer), findsOneWidget);
  });
}
