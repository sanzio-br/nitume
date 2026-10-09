import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

void main() {
  group('chip text (row 33, decided)', () {
    test('success, pending and danger labels are blue; dots keep the tone', () {
      expect(NitumeDesignChoices.chipHighContrastText, isTrue);
      for (final tone in StatusTone.values) {
        final c = StatusToneColors.of(tone);
        expect(c.label, NitumeColors.blue);
      }
      expect(
        StatusToneColors.of(StatusTone.success).dot,
        NitumeColors.green700,
      );
      expect(StatusToneColors.of(StatusTone.pending).dot, NitumeColors.amber);
      expect(StatusToneColors.of(StatusTone.danger).dot, NitumeColors.red);
    });

    testWidgets('StatusChip renders the label in blue', (tester) async {
      await pumpThemed(
        tester,
        const StatusChip(label: 'Cancelled', tone: StatusTone.danger),
      );
      final text = tester.widget<Text>(find.text('Cancelled'));
      expect(text.style?.color, NitumeColors.blue);
    });
  });

  test('modal scrim is blue at 50% (row 38, decided)', () {
    expect(NitumeDesignChoices.modalScrim, NitumeColors.blue.withAlpha(0x80));
  });

  group('NitumeTopBar empty title (Needs row 40)', () {
    testWidgets('renders no title text or header node when empty', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await pumpThemed(
        tester,
        const NitumeTopBar(title: '  ', greeting: 'Good morning'),
      );
      expect(find.text('Good morning'), findsOneWidget);
      expect(find.text('  '), findsNothing);
      expect(
        find.descendant(
          of: find.byType(NitumeTopBar),
          matching: find.byWidgetPredicate(
            (w) => w is Semantics && w.properties.header == true,
          ),
        ),
        findsNothing,
      );
      handle.dispose();
    });

    testWidgets('renders the title as a header when set', (tester) async {
      final handle = tester.ensureSemantics();
      await pumpThemed(tester, const NitumeTopBar(title: 'Home'));
      expect(
        tester.getSemantics(find.text('Home')),
        matchesSemantics(label: 'Home', isHeader: true),
      );
      handle.dispose();
    });
  });
}
