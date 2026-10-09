import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

/// Pumps [child] inside a themed [MaterialApp] on the slate canvas.
Future<void> pumpThemed(
  WidgetTester tester,
  Widget child, {
  Size? surfaceSize,
}) async {
  if (surfaceSize != null) {
    await tester.binding.setSurfaceSize(surfaceSize);
    addTearDown(() => tester.binding.setSurfaceSize(null));
  }
  await tester.pumpWidget(
    MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: NitumeTheme.light(),
      home: Scaffold(body: child),
    ),
  );
}

/// Wraps [child] for golden capture: fixed padding on slate, keyed boundary.
Widget goldenFrame(Widget child) => RepaintBoundary(
      key: const ValueKey('golden'),
      child: ColoredBox(
        color: NitumeColors.slate,
        child: Padding(padding: const EdgeInsets.all(16), child: child),
      ),
    );
