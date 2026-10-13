import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/main.dart';

void main() {
  testWidgets('the app starts with the Nitume theme', (t) async {
    await t.pumpWidget(const NitumeRunnerApp());
    expect(find.byType(NitumeWordmark), findsOneWidget);
  });
}
