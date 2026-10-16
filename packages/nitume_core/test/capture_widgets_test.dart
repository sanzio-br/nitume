import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/pump.dart';

// 1×1 transparent PNG.
final _png = Uint8List.fromList(const [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, //
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

void main() {
  group('CaptureDropZone (R-13)', () {
    testWidgets('dashed 2px card, blue icon, caption, tap picks', (
      tester,
    ) async {
      var picks = 0;
      await pumpThemed(
        tester,
        CaptureDropZone(
          caption: 'Tap to take a photo',
          height: 240,
          onPick: () => picks++,
        ),
      );
      final card = tester.widget<NitumeCard>(find.byType(NitumeCard));
      expect(card.border, NitumeCardBorder.dashed);
      expect(card.dashedBorderWidth, 2);
      final icon = tester.widget<Icon>(
        find.byIcon(Icons.photo_camera_outlined),
      );
      expect(icon.size, 36);
      expect(icon.color, NitumeColors.blue);
      final caption = tester.widget<Text>(find.text('Tap to take a photo'));
      expect(caption.style!.fontSize, 12.5);
      expect(caption.style!.color, NitumeColors.slate600);
      expect(tester.getSize(find.byType(CaptureDropZone)).height, 240);
      await tester.tap(find.byType(CaptureDropZone));
      expect(picks, 1);
    });

    testWidgets('busy: spinner and no picks', (tester) async {
      var picks = 0;
      await pumpThemed(
        tester,
        CaptureDropZone(
          caption: 'Tap to take a photo',
          onPick: () => picks++,
          busy: true,
        ),
      );
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await tester.tap(find.byType(CaptureDropZone));
      expect(picks, 0);
    });
  });

  group('CaptureThumbnail (R-15)', () {
    testWidgets('empty tile shows icon and side label', (tester) async {
      await pumpThemed(
        tester,
        const CaptureThumbnailRow(
          children: [
            CaptureThumbnail(
              state: CaptureState.empty,
              label: 'Front',
              aspectRatio: 1.4,
            ),
            CaptureThumbnail(
              state: CaptureState.empty,
              label: 'Back',
              aspectRatio: 1.4,
            ),
          ],
        ),
      );
      expect(find.text('Front'), findsOneWidget);
      expect(find.byIcon(Icons.badge_outlined), findsNWidgets(2));
      final size = tester.getSize(find.byType(AspectRatio).first);
      expect(size.width / size.height, closeTo(1.4, 0.01));
    });

    testWidgets('uploading, uploaded, failed', (tester) async {
      var retries = 0, removes = 0;
      await pumpThemed(
        tester,
        Row(
          children: [
            Expanded(
              child: CaptureThumbnail(
                state: CaptureState.uploading,
                image: MemoryImage(_png),
              ),
            ),
            Expanded(
              child: CaptureThumbnail(
                state: CaptureState.uploaded,
                image: MemoryImage(_png),
                caption: '10:31 AM',
                semanticLabel: 'Photo 2 of 3',
                onRemove: () => removes++,
              ),
            ),
            Expanded(
              child: CaptureThumbnail(
                state: CaptureState.failed,
                image: MemoryImage(_png),
                onRetry: () => retries++,
              ),
            ),
          ],
        ),
      );
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      final badge = tester.widget<Container>(
        find.byKey(const ValueKey('capture-uploaded-badge')),
      );
      expect((badge.decoration! as BoxDecoration).color, NitumeColors.green);
      expect(
        tester.widget<Text>(find.text('10:31 AM')).style!.fontFamily,
        NitumeTypography.numericFamily,
      );
      expect(
        find.bySemanticsLabel('Photo 2 of 3, uploaded, 10:31 AM'),
        findsOneWidget,
      );
      expect(find.text('Not uploaded'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.tap(find.byTooltip('Retake'));
      expect((retries, removes), (1, 1));
    });
  });
}
