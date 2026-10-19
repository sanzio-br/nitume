import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

void main() {
  testWidgets('70px green-050 circle with a 28px green check, read as Done', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await pumpThemed(tester, const Center(child: SuccessMark()));
    final box = tester.getSize(find.byType(SuccessMark));
    expect(box, const Size(70, 70));
    final deco =
        tester
                .widget<Container>(
                  find.descendant(
                    of: find.byType(SuccessMark),
                    matching: find.byType(Container),
                  ),
                )
                .decoration!
            as BoxDecoration;
    expect(deco.shape, BoxShape.circle);
    expect(deco.color, NitumeColors.green050);
    final icon = tester.widget<Icon>(find.byIcon(Icons.check_rounded));
    expect(icon.size, 28);
    expect(icon.color, NitumeColors.green);
    expect(find.bySemanticsLabel('Done'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('custom size; no label excludes it from semantics', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await pumpThemed(
      tester,
      const Center(child: SuccessMark(size: 64, semanticLabel: null)),
    );
    expect(tester.getSize(find.byType(SuccessMark)), const Size(64, 64));
    expect(find.bySemanticsLabel('Done'), findsNothing);
    semantics.dispose();
  });

  testWidgets('golden', (tester) async {
    await pumpThemed(
      tester,
      goldenFrame(const SuccessMark()),
      surfaceSize: const Size(140, 140),
    );
    await expectLater(
      find.byKey(const ValueKey('golden')),
      matchesGoldenFile('goldens/success_mark.png'),
    );
  }, tags: ['golden']);
}
