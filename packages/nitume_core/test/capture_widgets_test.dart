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

  group('CaptureDropZone title and captured state (C2)', () {
    testWidgets('title 13/600 blue above the caption, spoken first', (
      tester,
    ) async {
      await pumpThemed(
        tester,
        CaptureDropZone(
          title: 'Front of your ID',
          caption: 'Tap to take a photo or upload',
          onPick: () {},
        ),
      );
      final t = tester.widget<Text>(find.text('Front of your ID'));
      expect(t.style!.fontSize, 13);
      expect(t.style!.fontWeight, FontWeight.w600);
      expect(t.style!.color, NitumeColors.blue);
      expect(
        tester.getTopLeft(find.text('Front of your ID')).dy,
        lessThan(
          tester.getTopLeft(find.text('Tap to take a photo or upload')).dy,
        ),
      );
      expect(
        find.bySemanticsLabel(
          'Front of your ID, Tap to take a photo or upload',
        ),
        findsOneWidget,
      );
    });

    testWidgets('captured: photo, check badge, Retake; no pick', (
      tester,
    ) async {
      var picks = 0, retakes = 0;
      await pumpThemed(
        tester,
        CaptureDropZone(
          caption: 'Center your face in the frame',
          height: 260,
          onPick: () => picks++,
          image: MemoryImage(_png),
          onRetake: () => retakes++,
        ),
      );
      expect(find.byType(NitumeCard), findsNothing);
      expect(find.text('Center your face in the frame'), findsNothing);
      final clip = tester.widget<ClipRRect>(
        find.byKey(const ValueKey('capture-drop-zone-photo')),
      );
      expect(
        clip.borderRadius,
        BorderRadius.circular(NitumeDesignChoices.cardRadius),
      );
      expect(
        tester
            .getSize(find.byKey(const ValueKey('capture-drop-zone-photo')))
            .height,
        260,
      );
      expect(tester.widget<Image>(find.byType(Image)).fit, BoxFit.cover);
      expect(
        find.byKey(const ValueKey('capture-uploaded-badge')),
        findsOneWidget,
      );
      final retake = tester.widget<NitumeButton>(find.byType(NitumeButton));
      expect(retake.size, NitumeButtonSize.small);
      await tester.tap(find.text('Retake'));
      await tester.tap(find.byType(Image), warnIfMissed: false);
      expect((picks, retakes), (0, 1));
    });

    testWidgets('captured uploading: spinner, Retake disabled', (tester) async {
      var retakes = 0;
      await pumpThemed(
        tester,
        CaptureDropZone(
          caption: 'Center your face in the frame',
          onPick: () {},
          image: MemoryImage(_png),
          captureState: CaptureState.uploading,
          onRetake: () => retakes++,
        ),
      );
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(
        find.byKey(const ValueKey('capture-uploaded-badge')),
        findsNothing,
      );
      await tester.tap(find.text('Retake'), warnIfMissed: false);
      expect(retakes, 0);
    });

    testWidgets('captured failed: Not uploaded + Retry under the zone', (
      tester,
    ) async {
      var retries = 0;
      await pumpThemed(
        tester,
        CaptureDropZone(
          caption: 'Center your face in the frame',
          onPick: () {},
          image: MemoryImage(_png),
          captureState: CaptureState.failed,
          onRetry: () => retries++,
        ),
      );
      expect(find.text('Not uploaded'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      expect(retries, 1);
      expect(
        tester.getTopLeft(find.text('Not uploaded')).dy,
        greaterThan(
          tester
              .getBottomLeft(
                find.byKey(const ValueKey('capture-drop-zone-photo')),
              )
              .dy,
        ),
      );
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

    testWidgets('defaults: no outline, no side chip, no issue', (tester) async {
      await pumpThemed(
        tester,
        _sized(
          CaptureThumbnail(
            state: CaptureState.uploaded,
            image: MemoryImage(_png),
            label: 'Front',
          ),
        ),
      );
      expect(
        find.byKey(const ValueKey('capture-selected-outline')),
        findsNothing,
      );
      expect(find.byKey(const ValueKey('capture-side-label')), findsNothing);
      expect(find.byType(StatusChip), findsNothing);
      final badge = tester.getBottomLeft(
        find.byKey(const ValueKey('capture-uploaded-badge')),
      );
      final tile = tester.getBottomLeft(find.byType(AspectRatio));
      expect(badge.dx - tile.dx, 6);
    });

    testWidgets('selected: 2px blue outline and spoken', (tester) async {
      var taps = 0;
      await pumpThemed(
        tester,
        _sized(
          CaptureThumbnail(
            state: CaptureState.empty,
            label: 'Back',
            aspectRatio: 1.4,
            selected: true,
            onTap: () => taps++,
          ),
        ),
      );
      final box = tester.widget<DecoratedBox>(
        find.byKey(const ValueKey('capture-selected-outline')),
      );
      expect(box.position, DecorationPosition.foreground);
      final border = (box.decoration as BoxDecoration).border! as Border;
      expect(border.top.color, NitumeColors.blue);
      expect(border.top.width, 2);
      expect(
        find.bySemanticsLabel('Back, not captured, selected'),
        findsOneWidget,
      );
      await tester.tap(find.text('Back'));
      expect(taps, 1);
    });

    testWidgets('side label chip on a captured photo; badge moves right', (
      tester,
    ) async {
      await pumpThemed(
        tester,
        SizedBox(
          width: 200,
          child: CaptureThumbnail(
            state: CaptureState.uploaded,
            image: MemoryImage(_png),
            label: 'Front',
            aspectRatio: 1.4,
            showLabelOnPhoto: true,
          ),
        ),
      );
      final chip = tester.widget<DecoratedBox>(
        find.byKey(const ValueKey('capture-side-label')),
      );
      expect(
        (chip.decoration as BoxDecoration).color,
        NitumeDesignChoices.captureSideLabelFill,
      );
      final text = tester.widget<Text>(find.text('Front'));
      expect(text.style!.color, NitumeColors.white);
      expect(text.style!.fontSize, 11);
      expect(text.style!.fontWeight, FontWeight.w600);
      final tile = tester.getRect(find.byType(AspectRatio));
      final chipRect = tester.getRect(
        find.byKey(const ValueKey('capture-side-label')),
      );
      expect(chipRect.left - tile.left, 6);
      expect(tile.bottom - chipRect.bottom, 6);
      final badge = tester.getRect(
        find.byKey(const ValueKey('capture-uploaded-badge')),
      );
      expect(tile.right - badge.right, 6);
    });

    testWidgets('side label chip only on a captured photo', (tester) async {
      await pumpThemed(
        tester,
        _sized(
          const CaptureThumbnail(
            state: CaptureState.empty,
            label: 'Front',
            showLabelOnPhoto: true,
          ),
        ),
      );
      expect(find.byKey(const ValueKey('capture-side-label')), findsNothing);
      expect(find.text('Front'), findsOneWidget);
    });

    testWidgets('Not approved: danger chip and Retake on an empty tile', (
      tester,
    ) async {
      var retakes = 0;
      await pumpThemed(
        tester,
        _sized(
          CaptureThumbnail(
            state: CaptureState.empty,
            label: 'Back',
            aspectRatio: 1.4,
            selected: true,
            issue: CaptureIssue.notApproved,
            onRetake: () => retakes++,
          ),
        ),
      );
      final chip = tester.widget<StatusChip>(
        find.byKey(const ValueKey('capture-issue-notApproved')),
      );
      expect(chip.label, 'Not approved');
      expect(chip.tone, StatusTone.danger);
      expect(chip.size, StatusChipSize.compact);
      expect(
        find.bySemanticsLabel('Back, not captured, selected, not approved'),
        findsOneWidget,
      );
      await tester.tap(find.text('Retake'));
      expect(retakes, 1);
    });

    testWidgets('Too large replaces Not uploaded and hides the caption', (
      tester,
    ) async {
      var retakes = 0, retries = 0;
      await pumpThemed(
        tester,
        _sized(
          CaptureThumbnail(
            state: CaptureState.failed,
            image: MemoryImage(_png),
            label: 'Front',
            caption: '10:31 AM',
            issue: CaptureIssue.tooLarge,
            onRetake: () => retakes++,
            onRetry: () => retries++,
          ),
        ),
      );
      expect(find.text('Too large'), findsOneWidget);
      expect(find.text('Not uploaded'), findsNothing);
      expect(find.text('Retry'), findsNothing);
      expect(find.text('10:31 AM'), findsNothing);
      await tester.tap(find.text('Retake'));
      expect((retakes, retries), (1, 0));
    });

    testWidgets('issue without onRetake shows the chip only', (tester) async {
      await pumpThemed(
        tester,
        _sized(
          const CaptureThumbnail(
            state: CaptureState.empty,
            issue: CaptureIssue.tooLarge,
          ),
        ),
      );
      expect(find.text('Too large'), findsOneWidget);
      expect(find.text('Retake'), findsNothing);
    });
  });
}

/// A 200px-wide, top-left tile so the aspect ratio fits the test surface.
Widget _sized(Widget child) => Align(
  alignment: Alignment.topLeft,
  child: SizedBox(width: 200, child: child),
);
