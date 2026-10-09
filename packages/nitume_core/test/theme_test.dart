import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

void main() {
  group('NitumeColors', () {
    test('match nitume_design_system.html exactly', () {
      final expected = <Color, int>{
        NitumeColors.blue: 0xFF0B2545,
        NitumeColors.white: 0xFFFFFFFF,
        NitumeColors.slate: 0xFFF4F6F9,
        NitumeColors.green: 0xFF04AF4D,
        NitumeColors.blue700: 0xFF08192F,
        NitumeColors.blue050: 0xFFE9EDF3,
        NitumeColors.slateLine: 0xFFE2E7EF,
        NitumeColors.slate600: 0xFF5C6B85,
        NitumeColors.slate400: 0xFF8C97AC,
        NitumeColors.green050: 0xFFE3F8EA,
        NitumeColors.green700: 0xFF038A3D,
        NitumeColors.amber: 0xFFB8860B,
        NitumeColors.amber050: 0xFFFBF3E1,
        NitumeColors.red: 0xFFC1433C,
        NitumeColors.red050: 0xFFFBEAE9,
      };
      expected.forEach((color, hex) => expect(color.toARGB32(), hex));
    });

    test('radii match --r-s/m/l', () {
      expect(NitumeRadii.small, 8);
      expect(NitumeRadii.medium, 14);
      expect(NitumeRadii.large, 20);
    });
  });

  group('NitumeTypography', () {
    test('numeric uses the bundled Fira Code family', () {
      final style = NitumeTypography.numeric(fontSize: 12);
      expect(style.fontFamily, 'packages/nitume_core/FiraCode');
      expect(style.fontSize, 12);
    });

    test('text theme is Fira Sans throughout', () {
      final t = NitumeTypography.textTheme();
      for (final s in [
        t.displayLarge,
        t.headlineSmall,
        t.titleLarge,
        t.titleMedium,
        t.bodyMedium,
        t.bodySmall,
        t.labelLarge,
        t.labelSmall,
      ]) {
        expect(s?.fontFamily, 'packages/nitume_core/FiraSans');
      }
      expect(t.headlineSmall?.fontSize, 21);
      expect(t.titleLarge?.fontSize, 18);
    });
  });

  group('NitumeTheme.light', () {
    final theme = NitumeTheme.light();

    test('focused input border is a 2px green ring on an 8px field', () {
      final border =
          theme.inputDecorationTheme.focusedBorder! as OutlineInputBorder;
      expect(border.borderSide.color, NitumeColors.green);
      expect(border.borderSide.width, 2);
      expect(border.borderRadius, BorderRadius.circular(NitumeRadii.small));
      expect(theme.inputDecorationTheme.fillColor, NitumeColors.white);
    });

    test('navigation bar: green-700 active, slate-400 inactive, no indicator',
        () {
      final nav = theme.navigationBarTheme;
      expect(nav.indicatorColor, Colors.transparent);
      expect(
        nav.labelBehavior,
        NavigationDestinationLabelBehavior.alwaysShow,
      );
      final active = nav.iconTheme!.resolve({WidgetState.selected})!;
      final idle = nav.iconTheme!.resolve(<WidgetState>{})!;
      expect(active.color, NitumeColors.green700);
      expect(idle.color, NitumeColors.slate400);
    });

    test('primary button is green with white text and pill shape', () {
      final style = theme.filledButtonTheme.style!;
      expect(style.backgroundColor!.resolve({}), NitumeColors.green);
      expect(style.foregroundColor!.resolve({}), NitumeColors.white);
      final shape = style.shape!.resolve({})! as RoundedRectangleBorder;
      expect(
        shape.borderRadius,
        const BorderRadius.all(Radius.circular(NitumeRadii.pill)),
      );
    });

    test('app bar sits on slate with blue text', () {
      expect(theme.appBarTheme.backgroundColor, NitumeColors.slate);
      expect(theme.appBarTheme.foregroundColor, NitumeColors.blue);
    });
  });
}
