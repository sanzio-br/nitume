import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';
import 'package:runner_app/src/screens/active/evidence_capture_screen.dart';

import 'support/fakes.dart';

Future<TestBackend> _withJob(RunnerJobView job) async {
  final b = TestBackend();
  b.jobs.heldList = [job];
  b.jobs.jobs[job.id] = job;
  await b.services.active.load();
  return b;
}

void main() {
  group('v-evidence-capture', () {
    testWidgets('camera only: a photo uploads to the job', (t) async {
      final b = await _withJob(heldJob(status: ErrandStatus.arrived));
      await b.pumpScreen(
        t,
        const EvidenceCaptureScreen(errandId: 'e1', type: EvidenceType.photo),
      );
      expect(find.text('Capture evidence'), findsOneWidget);
      expect(find.text('Tap to take a photo'), findsOneWidget);
      expect(find.text(EvidenceCopy.info), findsOneWidget);
      // No Photo / Receipt toggle without a receipt step.
      expect(find.byType(NitumeChoiceChip), findsNothing);

      await t.tap(find.byKey(const ValueKey('evidence-drop-zone')));
      await t.pumpAndSettle();
      expect(b.capture.calls, [CaptureFrom.camera]);
      expect(b.jobs.evidenceUploads.single, ('e1', EvidenceType.photo));
      // B-1: the picker file is released once uploaded.
      expect(b.capture.discarded, ['/app/capture-1.jpg']);
    });

    testWidgets('offline: the kept photo is queued (rule 5)', (t) async {
      final b = await _withJob(heldJob(status: ErrandStatus.arrived));
      b.jobs.evidenceErrors.add(networkError);
      await b.pumpScreen(
        t,
        const EvidenceCaptureScreen(errandId: 'e1', type: EvidenceType.photo),
      );
      await t.tap(find.byKey(const ValueKey('evidence-drop-zone')));
      // A queued tile keeps its spinner: pump, never settle.
      for (var i = 0; i < 5; i++) {
        await t.pump(const Duration(milliseconds: 100));
      }
      expect(find.text(EvidenceCopy.offline), findsOneWidget);
      final queued = b.services.queue.pendingFor('e1').single;
      expect(queued.kind, QueuedActionKind.evidenceUpload);
      expect(queued.payload['path'], 'kept/capture-1.jpg');
      // The picker's own file is gone; the app-private copy waits.
      expect(b.capture.discarded, ['/app/capture-1.jpg']);
      expect(b.evidenceStore.kept, ['kept/capture-1.jpg']);
    });

    testWidgets('receipt preset: title, hint and the type toggle', (t) async {
      final b = await _withJob(
        heldJob(
          status: ErrandStatus.inProgress,
          category: ErrandCategory.buyForMe,
          itemAmount: '5000.00',
          merchantRoute: MerchantRoute.sendToRunner,
        ),
      );
      await b.pumpScreen(
        t,
        const EvidenceCaptureScreen(errandId: 'e1', type: EvidenceType.receipt),
      );
      expect(find.text('Upload receipt'), findsOneWidget);
      expect(find.text(EvidenceCopy.receiptHint), findsOneWidget);
      expect(find.byType(NitumeChoiceChip), findsNWidgets(2));
    });

    testWidgets('413 too large: size in Fira Code, no Retry, new capture', (
      t,
    ) async {
      final b = await _withJob(heldJob(status: ErrandStatus.arrived));
      b.jobs.evidenceErrors.add(
        apiError(
          ApiErrorCodes.evidenceTooLarge,
          status: 413,
          details: {'maxBytes': 5 * 1024 * 1024},
        ),
      );
      await b.pumpScreen(
        t,
        const EvidenceCaptureScreen(errandId: 'e1', type: EvidenceType.photo),
      );
      await t.tap(find.byKey(const ValueKey('evidence-drop-zone')));
      await t.pumpAndSettle();
      final notice = t.widget<NitumeNotice>(
        find.byKey(const ValueKey('evidence-too-large')),
      );
      expect(notice.tone, NitumeNoticeTone.danger);
      expect(notice.message, 'This photo is larger than 5 MB. Take it again.');
      final spans = <InlineSpan>[];
      notice.richMessage!.visitChildren((s) {
        spans.add(s);
        return true;
      });
      final size = spans.whereType<TextSpan>().firstWhere(
        (s) => s.text == '5 MB',
      );
      expect(size.style?.fontFamily, NitumeTypography.numericFamily);
      // The refused photo is gone (its copy deleted): no tile, no Retry, and
      // no leave dialog.
      expect(find.text('Not uploaded'), findsNothing);
      expect(find.text('Retry'), findsNothing);
      expect(b.services.uploads.existing('e1')!.items, isEmpty);

      // A new capture from the notice; it uploads.
      await t.tap(
        find.descendant(
          of: find.byKey(const ValueKey('evidence-too-large')),
          matching: find.text(EvidenceCopy.shutter),
        ),
      );
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('evidence-too-large')), findsNothing);
      expect(b.jobs.evidenceUploads.length, 2);
    });

    testWidgets('a bare 413 (proxy) uses the default limit', (t) async {
      final b = await _withJob(heldJob(status: ErrandStatus.arrived));
      b.jobs.evidenceErrors.add(apiError(null, status: 413));
      await b.pumpScreen(
        t,
        const EvidenceCaptureScreen(errandId: 'e1', type: EvidenceType.photo),
      );
      await t.tap(find.byKey(const ValueKey('evidence-drop-zone')));
      await t.pumpAndSettle();
      expect(
        t
            .widget<NitumeNotice>(
              find.byKey(const ValueKey('evidence-too-large')),
            )
            .message,
        RunnerEvidenceCopy.tooLarge(EvidenceTooLarge.defaultMaxBytes),
      );
    });

    testWidgets('DISPUTED: receipts allowed, photos refused (row 254)', (
      t,
    ) async {
      final job = heldJob(
        status: ErrandStatus.disputed,
        category: ErrandCategory.buyForMe,
        itemAmount: '5000.00',
        merchantRoute: MerchantRoute.sendToRunner,
      );
      expect(allowedEvidence(job, ErrandStatus.disputed), {
        EvidenceType.receipt,
      });
      // Without a purchase to reimburse, no receipts either.
      expect(
        allowedEvidence(
          heldJob(status: ErrandStatus.disputed),
          ErrandStatus.disputed,
        ),
        isEmpty,
      );
      final b = await _withJob(job);
      await b.pumpScreen(
        t,
        const EvidenceCaptureScreen(errandId: 'e1', type: EvidenceType.receipt),
      );
      expect(find.byKey(const ValueKey('evidence-drop-zone')), findsOneWidget);
      expect(find.text(EvidenceCopy.notAllowed), findsNothing);
      // Only one type, so no Photo / Receipt chips.
      expect(find.byType(NitumeChoiceChip), findsNothing);
    });

    testWidgets('leaving with a failed photo asks, then deletes it', (t) async {
      final b = await _withJob(heldJob(status: ErrandStatus.arrived));
      b.jobs.evidenceErrors.add(
        apiError('evidence_type_not_allowed', status: 400),
      );
      await b.pumpScreen(
        t,
        Builder(
          builder: (context) => TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const EvidenceCaptureScreen(
                  errandId: 'e1',
                  type: EvidenceType.photo,
                ),
              ),
            ),
            child: const Text('open'),
          ),
        ),
      );
      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('evidence-drop-zone')));
      await t.pumpAndSettle();
      // evidence_type_not_allowed: the generic error, not the size copy.
      expect(
        find.text('Something went wrong. Please try again.'),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('evidence-too-large')), findsNothing);
      await t.tap(find.bySemanticsLabel('Back'));
      await t.pumpAndSettle();
      expect(find.text('Leave without 1 photo?'), findsOneWidget);
      await t.tap(find.text('Leave'));
      await t.pumpAndSettle();
      expect(find.byType(EvidenceCaptureScreen), findsNothing);
      expect(b.services.uploads.existing('e1')?.items ?? const [], isEmpty);
    });

    testWidgets('a state that takes no photos shows the stale notice', (
      t,
    ) async {
      final b = await _withJob(heldJob(status: ErrandStatus.runnerEnRoute));
      await b.pumpScreen(
        t,
        const EvidenceCaptureScreen(errandId: 'e1', type: EvidenceType.photo),
      );
      expect(find.text(EvidenceCopy.notAllowed), findsOneWidget);
      expect(find.byKey(const ValueKey('evidence-drop-zone')), findsNothing);
    });
  });
}
