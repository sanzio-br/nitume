import 'package:customer_app/src/screens/auth/phone_screen.dart';
import 'package:customer_app/src/screens/task/task_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

Evidence photo(String id, int minute) => Evidence(
  id: id,
  errandId: 'e1',
  type: EvidenceType.photo,
  capturedAt: DateTime(2026, 10, 7, 10, minute),
);

void main() {
  group('x-legal', () {
    testWidgets('plain text when no link can be opened (SQ-2)', (t) async {
      final b = TestBackend(
        appConfig: AppConfig(termsUri: Uri.parse('https://nitume.test/terms')),
      );
      await b.pumpScreen(t, const PhoneScreen());
      final rich = t.widget<RichText>(
        find.byWidgetPredicate(
          (w) =>
              w is RichText &&
              w.text.toPlainText().startsWith('By continuing you agree'),
        ),
      );
      var links = 0;
      rich.text.visitChildren((span) {
        if (span is TextSpan && span.recognizer != null) links++;
        return true;
      });
      expect(links, 0);
    });

    testWidgets('configured links open through AppConfig', (t) async {
      final opened = <Uri>[];
      final b = TestBackend(
        appConfig: AppConfig(
          termsUri: Uri.parse('https://nitume.test/terms'),
          privacyUri: Uri.parse('https://nitume.test/privacy'),
          onOpenLink: (uri) async {
            opened.add(uri);
            return true;
          },
        ),
      );
      await b.pumpScreen(t, const PhoneScreen());
      await t.tapOnText(find.textRange.ofSubstring('Privacy Policy'));
      await t.pumpAndSettle();
      expect(opened, [Uri.parse('https://nitume.test/privacy')]);
    });

    testWidgets('open failure shows the snackbar', (t) async {
      final b = TestBackend(
        appConfig: AppConfig(
          termsUri: Uri.parse('https://nitume.test/terms'),
          onOpenLink: (_) async => false,
        ),
      );
      await b.pumpScreen(t, const PhoneScreen());
      await t.tapOnText(find.textRange.ofSubstring('Terms'));
      await t.pumpAndSettle();
      expect(
        find.text("Couldn't open the page. Try again later."),
        findsOneWidget,
      );
    });
  });

  group('x-evidence-viewer', () {
    testWidgets('opens at the tapped item with counter and caption', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.completed));
      b.evidence.items = [photo('ev1', 41), photo('ev2', 43)];
      await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));

      await t.tap(find.byType(EvidenceTile).at(1));
      await t.pumpAndSettle();
      expect(find.byType(EvidenceViewer), findsOneWidget);
      expect(find.text('2/2'), findsOneWidget);
      expect(
        find.text('Photo · 10:43 AM', findRichText: true),
        findsOneWidget,
      );
    });
  });

  group('v-task-detail', () {
    testWidgets('Rate this task also for SETTLED when unrated', (t) async {
      final b = TestBackend();
      b.errands.put(errand(status: ErrandStatus.settled));
      await b.pumpScreen(t, const TaskDetailScreen(errandId: 'e1'));
      expect(find.text('Rate this task'), findsOneWidget);
    });
  });
}
