import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

void main() {
  group('InitialsAvatar glyph fallback (CC-3)', () {
    testWidgets('shows initials when there is a name', (tester) async {
      await pumpThemed(tester, InitialsAvatar.fromName('Brian K.'));
      expect(find.text('BK'), findsOneWidget);
      expect(find.byKey(const ValueKey('initials-avatar-glyph')), findsNothing);
    });

    for (final name in <String?>[null, '', '   ']) {
      testWidgets(
        'shows the white person glyph for ${name == null ? 'null' : '"$name"'}',
        (tester) async {
          await pumpThemed(
            tester,
            InitialsAvatar.fromName(name, size: InitialsAvatarSize.medium),
          );
          final icon = tester.widget<Icon>(
            find.byKey(const ValueKey('initials-avatar-glyph')),
          );
          expect(icon.icon, Icons.person_outline_rounded);
          expect(icon.color, NitumeColors.white);
          expect(icon.size, 30);
        },
      );
    }

    testWidgets('glyph avatar keeps the 48dp tap target', (tester) async {
      var taps = 0;
      await pumpThemed(
        tester,
        Center(
          child: InitialsAvatar(initials: '', onTap: () => taps++),
        ),
      );
      expect(tester.getSize(find.byType(InkResponse)), const Size(48, 48));
      await tester.tap(find.byType(InkResponse));
      expect(taps, 1);
    });
  });

  group('NitumeField', () {
    testWidgets('passes textCapitalization through', (tester) async {
      await pumpThemed(
        tester,
        const NitumeField(
          label: 'Your name',
          textCapitalization: TextCapitalization.words,
        ),
      );
      expect(
        tester.widget<TextField>(find.byType(TextField)).textCapitalization,
        TextCapitalization.words,
      );
    });

    testWidgets('defaults to no capitalisation', (tester) async {
      await pumpThemed(tester, const NitumeField.multiline(label: 'Notes'));
      expect(
        tester.widget<TextField>(find.byType(TextField)).textCapitalization,
        TextCapitalization.none,
      );
    });

    testWidgets('money prefix is visible while empty and unfocused', (
      tester,
    ) async {
      await pumpThemed(tester, NitumeField.money(hint: '0'));
      final prefix = find.byKey(const ValueKey('nitume-field-prefix'));
      expect(prefix, findsOneWidget);
      expect(
        find.descendant(of: prefix, matching: find.text('KSh ')),
        findsOneWidget,
      );
      expect(
        tester.widget<Text>(find.text('KSh ')).style?.fontFamily,
        NitumeTypography.numericFamily,
      );
      // Not hidden behind an opacity animation.
      final opacities = tester.widgetList<Opacity>(
        find.ancestor(of: find.text('KSh '), matching: find.byType(Opacity)),
      );
      expect(opacities.every((o) => o.opacity == 1), isTrue);
      expect(find.text('0'), findsOneWidget);
    });

    testWidgets('generic prefixText keeps Material behaviour', (tester) async {
      await pumpThemed(tester, const NitumeField(prefixText: '+254 '));
      expect(find.byKey(const ValueKey('nitume-field-prefix')), findsNothing);
    });
  });
}
