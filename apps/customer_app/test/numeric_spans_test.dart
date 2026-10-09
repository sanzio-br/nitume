import 'package:customer_app/src/screens/checkout/awaiting_quote_screen.dart';
import 'package:customer_app/src/screens/task/evidence_confirm_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'support/fakes.dart';

/// The Fira Code spans inside the rich text that reads [plain].
List<String> numSpans(WidgetTester t, String plain) {
  final text = t.widget<Text>(find.text(plain));
  final out = <String>[];
  text.textSpan?.visitChildren((s) {
    if (s is NumSpan) out.add(s.text!);
    return true;
  });
  return out;
}

void main() {
  testWidgets('checkout CTA amount is a Fira Code span (CC-2)', (t) async {
    final b = TestBackend();
    b.errands.put(
      errand(
        status: ErrandStatus.quoted,
        quotedPrice: '2200.00',
        withRunner: false,
      ),
    );
    await b.pumpScreen(t, const AwaitingQuoteScreen(errandId: 'e1'));
    expect(numSpans(t, 'Confirm & pay KSh 2,200 →'), ['KSh 2,200']);
    expect(find.bySemanticsLabel('Confirm & pay KSh 2,200 →'), findsOneWidget);
  });

  testWidgets('evidence count is a Fira Code span (CC-2)', (t) async {
    final b = TestBackend();
    b.errands.put(errand(status: ErrandStatus.awaitingCustomer));
    b.evidence.items = [
      Evidence(id: 'a', errandId: 'e1', type: EvidenceType.photo),
    ];
    await b.pumpScreen(t, const EvidenceConfirmScreen(errandId: 'e1'));
    expect(numSpans(t, 'PHOTOS & VIDEO (1)'), ['(1)']);
  });
}
