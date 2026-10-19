import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/onboarding/onboard_id_screen.dart';
import 'package:runner_app/src/screens/onboarding/onboard_pending_screen.dart';
import 'package:runner_app/src/screens/onboarding/onboard_selfie_screen.dart';
import 'package:runner_app/src/screens/shell/runner_shell.dart';
import 'package:runner_app/src/widgets/privacy_note.dart';

import 'support/fakes.dart';

const _front = VerificationDocumentSide.front;
const _back = VerificationDocumentSide.back;

RunnerVerification _id(VerificationStatus s, VerificationDocumentSide side) =>
    verification(RunnerVerificationType.governmentId, s, side: side);

RunnerVerification _of(RunnerVerificationType t, VerificationStatus s) =>
    verification(t, s);

String _chipIn(WidgetTester t, String rowLabel) {
  final row = find.ancestor(
    of: find.text(rowLabel),
    matching: find.byType(InfoRow),
  );
  return t
      .widget<StatusChip>(
        find.descendant(of: row, matching: find.byType(StatusChip)),
      )
      .label;
}

Future<void> _pickFromSheet(WidgetTester t, String option) async {
  await t.tap(find.byKey(const ValueKey('id-drop-zone')));
  await t.pumpAndSettle();
  await t.tap(find.text(option));
  await t.pumpAndSettle();
}

void main() {
  group('v-onboard-pending', () {
    testWidgets('rows, chips, in-review body and privacy text', (t) async {
      final b = TestBackend();
      b.account.records = [
        _of(RunnerVerificationType.phone, VerificationStatus.approved),
        _id(VerificationStatus.pending, _front),
        _id(VerificationStatus.approved, _back),
        _of(RunnerVerificationType.selfie, VerificationStatus.pending),
      ];
      await b.pumpScreen(t, const OnboardPendingScreen());

      expect(find.text('Verification status'), findsOneWidget);
      expect(_chipIn(t, 'Phone number'), 'Verified');
      expect(_chipIn(t, 'National ID'), 'In review');
      expect(_chipIn(t, 'Selfie / liveness check'), 'In review');
      expect(_chipIn(t, 'M-Pesa identity match'), 'Not started');
      expect(
        find.textContaining(
          'Verification usually takes under ',
          findRichText: true,
        ),
        findsOneWidget,
      );
      expect(find.text(PrivacyCopy.full), findsOneWidget);
      // No published URL: the link is hidden, the text stays (row 173).
      expect(find.text('Privacy Policy'), findsNothing);
      expect(find.widgetWithText(NitumeButton, 'Back to app'), findsOneWidget);
      expect(find.text('Upload again'), findsNothing);
    });

    testWidgets('one rejected ID side: Not approved, caption, Upload again '
        'opens that side', (t) async {
      final b = TestBackend();
      b.account.records = [
        _of(RunnerVerificationType.phone, VerificationStatus.approved),
        _id(VerificationStatus.approved, _front),
        _id(VerificationStatus.rejected, _back),
        _of(RunnerVerificationType.selfie, VerificationStatus.rejected),
      ];
      await b.pumpScreen(t, const OnboardPendingScreen());

      expect(_chipIn(t, 'National ID'), 'Not approved');
      expect(find.text('Back photo not approved'), findsOneWidget);
      expect(find.text('Retake selfie'), findsOneWidget);
      expect(
        find.text(
          "Some checks weren't approved. Fix them below and we'll review "
          'again.',
        ),
        findsOneWidget,
      );

      await t.tap(find.text('Upload again'));
      await t.pumpAndSettle();
      expect(find.byType(OnboardIdScreen), findsOneWidget);
      expect(
        find.text(
          "Your back photo couldn't be verified. Upload a clearer photo of "
          'that side.',
        ),
        findsOneWidget,
      );
      expect(find.text('Back of your ID'), findsOneWidget);
    });

    testWidgets('ID or selfie not started, none rejected: upload body', (
      t,
    ) async {
      final b = TestBackend();
      b.account.records = [
        _of(RunnerVerificationType.phone, VerificationStatus.approved),
        _id(VerificationStatus.pending, _front),
        _id(VerificationStatus.pending, _back),
      ];
      await b.pumpScreen(t, const OnboardPendingScreen());
      expect(_chipIn(t, 'Selfie / liveness check'), 'Not started');
      expect(
        find.text('Upload your ID and a selfie to start accepting jobs.'),
        findsOneWidget,
      );
      expect(
        find.textContaining(
          'Verification usually takes under ',
          findRichText: true,
        ),
        findsNothing,
      );
    });

    testWidgets('all approved: verified body and Start accepting jobs', (
      t,
    ) async {
      final b = TestBackend();
      await b.pumpScreen(t, const OnboardPendingScreen());
      expect(
        find.text("You're verified. You can go online and accept jobs."),
        findsOneWidget,
      );
      expect(
        find.widgetWithText(NitumeButton, 'Start accepting jobs'),
        findsOneWidget,
      );
    });

    testWidgets('configured privacy URL shows the link', (t) async {
      final opened = <Uri>[];
      final b = TestBackend(
        appConfig: AppConfig(
          privacyUri: Uri.parse('https://nitume.example/privacy'),
          onOpenLink: (u) async {
            opened.add(u);
            return true;
          },
        ),
      );
      await b.pumpScreen(t, const OnboardPendingScreen());
      await t.tap(find.widgetWithText(NitumeButton, 'Privacy Policy'));
      await t.pumpAndSettle();
      expect(opened, [Uri.parse('https://nitume.example/privacy')]);
    });

    testWidgets('load error offers Try again', (t) async {
      final b = TestBackend();
      b.account.recordsError = networkError;
      await b.pumpScreen(t, const OnboardPendingScreen());
      expect(find.text('Check your connection and try again.'), findsOneWidget);

      b.account.recordsError = null;
      await t.tap(find.text('Try again'));
      await t.pumpAndSettle();
      expect(_chipIn(t, 'Phone number'), 'Verified');
    });
  });

  group('v-onboard-id', () {
    testWidgets('front then back upload with their side, then Continue', (
      t,
    ) async {
      final b = TestBackend();
      b.account.records = [];
      await b.pumpScreen(t, const OnboardIdScreen());

      expect(find.text('ID verification'), findsOneWidget);
      expect(find.text('Step 1 of 2'), findsOneWidget);
      expect(
        find.text(
          'Upload clear photos of the front and back of your National ID.',
        ),
        findsOneWidget,
      );
      expect(find.text('Tap to take a photo or upload'), findsOneWidget);
      expect(find.text('Front of your ID'), findsOneWidget);
      expect(find.text(PrivacyCopy.short), findsOneWidget);
      final cta = find.widgetWithText(NitumeButton, 'Continue →');
      expect(t.widget<NitumeButton>(cta).onPressed, isNull);

      await _pickFromSheet(t, 'Take photo');
      expect(b.capture.calls, [CaptureFrom.camera]);
      expect(b.account.uploads.single.$2, _front);
      // B-1: the capture (and any picker scratch copy) is discarded.
      expect(b.capture.discarded, ['/app/capture-1.jpg']);
      // The back is selected next.
      expect(find.text('Back of your ID'), findsOneWidget);

      await _pickFromSheet(t, 'Choose from gallery');
      expect(b.capture.calls.last, CaptureFrom.gallery);
      expect(b.account.uploads.map((u) => u.$2), [_front, _back]);
      expect(
        b.account.uploads.every(
          (u) => u.$1 == RunnerVerificationType.governmentId,
        ),
        isTrue,
      );
      // Both in: the drop zone hides, Continue opens the selfie step.
      expect(find.byKey(const ValueKey('id-drop-zone')), findsNothing);
      expect(t.widget<NitumeButton>(cta).onPressed, isNotNull);
      await t.tap(cta);
      await t.pumpAndSettle();
      expect(find.byType(OnboardSelfieScreen), findsOneWidget);
    });

    testWidgets('a gallery photo above 10 MB is discarded, never sent', (
      t,
    ) async {
      final b = TestBackend();
      b.account.records = [];
      // Gallery picks are no longer downscaled: the full-size original.
      b.files.size = VerificationDocumentRules.maxBytes + 1;
      b.capture.next = '/cache/uuid/original.jpg';
      await b.pumpScreen(t, const OnboardIdScreen());

      await _pickFromSheet(t, 'Choose from gallery');
      expect(b.capture.calls, [CaptureFrom.gallery]);
      expect(b.account.uploads, isEmpty);
      expect(b.capture.discarded, ['/cache/uuid/original.jpg']);
      expect(
        find.text(
          'This photo is larger than 10 MB. Take it again or choose a '
          'smaller photo.',
          findRichText: true,
        ),
        findsOneWidget,
      );
    });

    testWidgets('upload error: Not uploaded, notice, Retry resends', (t) async {
      final b = TestBackend();
      b.account.records = [];
      b.account.uploadErrors.add(networkError);
      await b.pumpScreen(t, const OnboardIdScreen());

      await _pickFromSheet(t, 'Take photo');
      expect(find.text('Not uploaded'), findsOneWidget);
      expect(find.text('Check your connection and try again.'), findsOneWidget);

      await t.tap(find.text('Retry'));
      await t.pumpAndSettle();
      expect(b.account.uploads.length, 2);
      expect(find.text('Not uploaded'), findsNothing);
      expect(find.text('Back of your ID'), findsOneWidget);
    });

    testWidgets('uploaded sides from the server enable Continue', (t) async {
      final b = TestBackend();
      b.account.records = [
        _id(VerificationStatus.pending, _front),
        _id(VerificationStatus.pending, _back),
      ];
      await b.pumpScreen(t, const OnboardIdScreen());
      expect(find.byKey(const ValueKey('id-drop-zone')), findsNothing);
      expect(
        t
            .widget<NitumeButton>(
              find.widgetWithText(NitumeButton, 'Continue →'),
            )
            .onPressed,
        isNotNull,
      );
    });

    testWidgets('first run: back asks Leave verification?', (t) async {
      final b = TestBackend();
      b.account.records = [];
      await b.pumpScreen(t, const RunnerShell());
      Navigator.of(t.element(find.byType(RunnerShell))).push(
        MaterialPageRoute<void>(
          builder: (_) => const OnboardIdScreen(firstRun: true),
        ),
      );
      await t.pumpAndSettle();

      await t.tap(find.bySemanticsLabel('Back'));
      await t.pumpAndSettle();
      expect(find.text('Leave verification?'), findsOneWidget);
      expect(
        find.text('You can finish it later from your profile.'),
        findsOneWidget,
      );
      await t.tap(find.text('Stay'));
      await t.pumpAndSettle();
      expect(find.byType(OnboardIdScreen), findsOneWidget);

      await t.tap(find.bySemanticsLabel('Back'));
      await t.pumpAndSettle();
      await t.tap(find.text('Leave'));
      await t.pumpAndSettle();
      expect(find.byType(OnboardIdScreen), findsNothing);
      expect(find.byType(RunnerShell), findsOneWidget);
    });
  });

  group('v-onboard-selfie', () {
    testWidgets('selfie upload enables Submit, which shows the status', (
      t,
    ) async {
      final b = TestBackend();
      b.account.records = [
        _id(VerificationStatus.pending, _front),
        _id(VerificationStatus.pending, _back),
      ];
      await b.pumpScreen(t, const OnboardSelfieScreen());

      expect(find.text('Selfie check'), findsOneWidget);
      expect(find.text('Step 2 of 2'), findsOneWidget);
      expect(find.text('Center your face in the frame'), findsOneWidget);
      expect(
        find.text('Face the light, remove sunglasses or a hat.'),
        findsOneWidget,
      );
      final cta = find.widgetWithText(NitumeButton, 'Submit for review →');
      expect(t.widget<NitumeButton>(cta).onPressed, isNull);

      await t.tap(find.byKey(const ValueKey('selfie-drop-zone')));
      await t.pumpAndSettle();
      expect(b.capture.calls, [CaptureFrom.camera]);
      final upload = b.account.uploads.single;
      expect(upload.$1, RunnerVerificationType.selfie);
      expect(upload.$2, isNull);
      expect(find.text('Retake'), findsOneWidget);

      await t.tap(cta);
      await t.pumpAndSettle();
      expect(find.byType(OnboardPendingScreen), findsOneWidget);
      expect(find.byType(OnboardSelfieScreen), findsNothing);
    });

    testWidgets('a selfie above 10 MB is never sent', (t) async {
      final b = TestBackend();
      b.account.records = [];
      b.files.size = VerificationDocumentRules.maxBytes + 1;
      await b.pumpScreen(t, const OnboardSelfieScreen());
      await t.tap(find.byKey(const ValueKey('selfie-drop-zone')));
      await t.pumpAndSettle();
      expect(b.account.uploads, isEmpty);
      expect(
        find.text(
          'This photo is larger than 10 MB. Take it again.',
          findRichText: true,
        ),
        findsOneWidget,
      );
    });
  });
}
