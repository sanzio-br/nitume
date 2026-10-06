// Basic smoke tests for the customer app.

import 'package:flutter_test/flutter_test.dart';

import 'package:customer_app/src/app.dart';

void main() {
  testWidgets('Renders the OTP login screen', (WidgetTester tester) async {
    await tester.pumpWidget(const NitumeCustomerApp());

    expect(find.text('Nitume'), findsOneWidget);
    expect(find.text('Continue'), findsOneWidget);
    expect(find.text('Phone number'), findsOneWidget);
  });
}