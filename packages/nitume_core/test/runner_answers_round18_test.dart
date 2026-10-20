import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

Map<String, dynamic> _job([Map<String, dynamic>? extra]) => {
  'id': 'e1',
  'reference': 'NT-0042',
  'status': 'IN_PROGRESS',
  'category': 'buy_for_me',
  'description': 'Buy milk',
  'urgency': 'standard',
  'runnerFee': '250.00',
  'itemAmount': '1200.00',
  'merchantRoute': 'send_to_runner',
  'requiredPurchase': '1000.00',
  'maxPurchaseAdvance': '5000.00',
  'overPurchaseLimit': false,
  'assignment': {'id': 'a1', 'status': 'accepted'},
  ...?extra,
};

void main() {
  group('RunnerJobView.differenceAwaitingPayment (row 248)', () {
    test('parsed when set; requiredPurchase stays the old ceiling', () {
      final j = RunnerJobView.fromJson(
        _job({
          'differenceAwaitingPayment': {
            'amount': '200.00',
            'priceChangeRequestIds': ['p1', 'p2'],
          },
        }),
      );
      expect(j.isAwaitingDifference, isTrue);
      expect(j.differenceAwaitingPayment!.amount, '200.00');
      expect(j.differenceAwaitingPayment!.priceChangeRequestIds, ['p1', 'p2']);
      expect(j.itemAmount, '1200.00');
      expect(j.requiredPurchase, '1000.00');
    });

    test('null, absent or unreadable means nothing waiting', () {
      for (final v in <Object?>[
        null,
        'x',
        {'priceChangeRequestIds': <String>[]},
      ]) {
        final j = RunnerJobView.fromJson(
          _job({'differenceAwaitingPayment': v}),
        );
        expect(j.differenceAwaitingPayment, isNull, reason: '$v');
        expect(j.isAwaitingDifference, isFalse);
      }
      expect(RunnerJobView.fromJson(_job()).differenceAwaitingPayment, isNull);
    });

    test('numeric amount becomes a 2-decimal string; bad ids skipped', () {
      final d = DifferenceAwaitingPayment.tryFromJson({
        'amount': 150,
        'priceChangeRequestIds': ['p1', 3, '', null],
      })!;
      expect(d.amount, '150.00');
      expect(d.priceChangeRequestIds, ['p1']);
      expect(
        DifferenceAwaitingPayment.tryFromJson({'amount': '1.00'})!
            .priceChangeRequestIds,
        isEmpty,
      );
    });

    test('offers and held-jobs pages carry it', () {
      final page = RunnerOffersPage.fromJson({
        'items': [
          _job({
            'differenceAwaitingPayment': {
              'amount': '50.00',
              'priceChangeRequestIds': ['p9'],
            },
          }),
          _job({'id': 'e2', 'differenceAwaitingPayment': null}),
        ],
        'nextCursor': null,
      });
      expect(page.items[0].differenceAwaitingPayment!.amount, '50.00');
      expect(page.items[1].differenceAwaitingPayment, isNull);
    });
  });

  group('EvidenceTooLarge (row 252)', () {
    test('code and constant', () {
      expect(ApiErrorCodes.evidenceTooLarge, 'evidence_too_large');
      expect(EvidenceTooLarge.defaultMaxBytes, 10 * 1024 * 1024);
    });

    test('coded 413 carries maxBytes', () {
      const e = NitumeApiException(
        message: 'x',
        statusCode: 413,
        code: 'evidence_too_large',
        details: {'maxBytes': 5242880},
      );
      expect(EvidenceTooLarge.of(e)!.maxBytes, 5242880);
    });

    test('a bare 413 falls back to the default', () {
      const e = NitumeApiException(message: 'x', statusCode: 413);
      expect(
        EvidenceTooLarge.of(e)!.maxBytes,
        EvidenceTooLarge.defaultMaxBytes,
      );
    });

    test('anything else is null', () {
      expect(EvidenceTooLarge.of(null), isNull);
      expect(EvidenceTooLarge.of(StateError('x')), isNull);
      expect(
        EvidenceTooLarge.of(
          const NitumeApiException(message: 'x', statusCode: 409),
        ),
        isNull,
      );
      expect(
        EvidenceTooLarge.of(
          const NitumeApiException(
            message: 'x',
            statusCode: 413,
            code: 'verification_document_too_large',
          ),
        ),
        isNull,
      );
    });

    test('replayOutcomeFor: a 413 is permanent (tooLarge)', () {
      expect(
        replayOutcomeFor(
          const NitumeApiException(
            message: 'x',
            statusCode: 413,
            code: 'evidence_too_large',
          ),
        ),
        ReplayOutcome.tooLarge,
      );
      expect(
        replayOutcomeFor(
          const NitumeApiException(message: 'x', statusCode: 413),
        ),
        ReplayOutcome.tooLarge,
      );
    });

    test('the queue drops it as tooLarge and deletes its file (B-1)', () async {
      final app = Directory.systemTemp.createTempSync('app');
      addTearDown(() => app.deleteSync(recursive: true));
      final files = DirectoryEvidenceFileStore(() async => app);
      final src = File('${app.path}/src.jpg')..writeAsBytesSync([1, 2, 3]);
      final path = await files.keep(src.path);
      final dropped = <QueueDropReason>[];
      var runs = 0;
      final queue = OfflineActionQueue(
        store: InMemoryQueueStore(),
        runner: (_) async {
          runs++;
          return replayOutcomeFor(
            const NitumeApiException(
              message: 'x',
              statusCode: 413,
              code: 'evidence_too_large',
            ),
          );
        },
        onDropped: (_, r) => dropped.add(r),
        onSettled: RunnerQueuedActions.cleanupFor(files),
      );
      await queue.enqueue(
        QueuedActionKind.evidenceUpload,
        errandId: 'e1',
        payload: RunnerQueuedActions.evidence(
          path: path,
          type: EvidenceType.receipt,
          contentType: 'image/jpeg',
        ),
      );
      await queue.replay();
      expect(queue.isEmpty, isTrue);
      expect(dropped, [QueueDropReason.tooLarge]);
      expect(File(path).existsSync(), isFalse);
      await queue.replay();
      expect(runs, 1, reason: 'never retried');
    });
  });

  group('RunnerEvidenceRules (rows 121, 129, 254)', () {
    test('mirrors the API upload states', () {
      expect(RunnerEvidenceRules.allowedIn(ErrandStatus.arrived), {
        EvidenceType.photo,
        EvidenceType.receipt,
      });
      expect(RunnerEvidenceRules.allowedIn(ErrandStatus.inProgress), {
        EvidenceType.photo,
        EvidenceType.receipt,
      });
      expect(RunnerEvidenceRules.allowedIn(ErrandStatus.awaitingCustomer), {
        EvidenceType.receipt,
      });
      expect(
        RunnerEvidenceRules.allowedIn(ErrandStatus.runnerEnRoute),
        isEmpty,
      );
      expect(RunnerEvidenceRules.allowedIn(ErrandStatus.completed), isEmpty);
    });

    test('DISPUTED takes receipts, never photos (row 254)', () {
      expect(
        RunnerEvidenceRules.allows(ErrandStatus.disputed, EvidenceType.receipt),
        isTrue,
      );
      expect(
        RunnerEvidenceRules.allows(ErrandStatus.disputed, EvidenceType.photo),
        isFalse,
      );
    });

    test('CANCELLED / FAILED take receipts only while the window is open', () {
      for (final s in [ErrandStatus.cancelled, ErrandStatus.failed]) {
        expect(RunnerEvidenceRules.allowedIn(s), {EvidenceType.receipt});
        expect(
          RunnerEvidenceRules.allowedIn(s, receiptWindowOpen: false),
          isEmpty,
        );
      }
    });
  });

  group('copy', () {
    test('row 248 approved copy, verbatim', () {
      expect(
        RunnerPriceChangeCopy.differenceAwaitingPayment,
        'Approved. Waiting for the customer to pay the difference.',
      );
    });

    test('proposed too-large copy uses the limit', () {
      expect(
        RunnerEvidenceCopy.tooLarge(10 * 1024 * 1024),
        'This photo is larger than 10 MB. Take it again.',
      );
      expect(RunnerEvidenceCopy.tooLargeLimit(5 * 1024 * 1024), '5 MB');
      expect(RunnerEvidenceCopy.tooLargeLimit(1572864), '1.5 MB');
    });
  });
}
