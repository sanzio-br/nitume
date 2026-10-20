import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/shell/runner_shell.dart';
import 'package:runner_app/src/services/shell_controller.dart';

import 'support/fakes.dart';

void main() {
  testWidgets('the shell shows the four root tabs on Jobs', (t) async {
    final b = TestBackend();
    await b.pumpScreen(t, const RunnerShell());

    final bar = t.widget<NitumeTabBar>(find.byType(NitumeTabBar));
    expect(bar.items.map((i) => i.label), [
      'Jobs',
      'Active',
      'Earnings',
      'Profile',
    ]);
    expect(bar.currentIndex, 0);
    expect(b.services.shell.tab, RunnerTab.jobs);
  });

  testWidgets('tapping a tab switches the root view', (t) async {
    final b = TestBackend();
    await b.pumpScreen(t, const RunnerShell());

    for (final (label, tab) in [
      ('Active', RunnerTab.active),
      ('Earnings', RunnerTab.earnings),
      ('Profile', RunnerTab.profile),
      ('Jobs', RunnerTab.jobs),
    ]) {
      await t.tap(
        find.descendant(
          of: find.byType(NitumeTabBar),
          matching: find.text(label),
        ),
      );
      await t.pumpAndSettle();
      expect(b.services.shell.tab, tab);
      expect(
        t.widget<NitumeTabBar>(find.byType(NitumeTabBar)).currentIndex,
        tab.index,
      );
      // The visible root view carries its title in its top bar.
      expect(
        find
            .descendant(
              of: find.byType(NitumeTopBar),
              matching: find.text(switch (label) {
                'Jobs' => 'Nearby jobs',
                'Active' => 'Active job',
                _ => label,
              }),
            )
            .hitTestable(),
        findsOneWidget,
      );
    }
  });
}
