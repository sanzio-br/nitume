import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.status, this.body);

  final int status;
  final Object? body;
  RequestOptions? last;
  int calls = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls++;
    last = options;
    // Drain the multipart stream like a real adapter would.
    if (requestStream != null) await requestStream.drain<void>();
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: const {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

RunnerAccountRepository _repo(_Adapter a) => RunnerAccountRepository(
  NitumeApiClient(
    config: const ApiConfig(baseUrl: 'https://api.test/api/v1'),
    tokenStore: InMemoryTokenStore(),
    httpClientAdapter: a,
  ),
);

const _view = {
  'id': 'v9',
  'runnerProfileId': 'rp1',
  'verificationType': 'government_id',
  'status': 'pending',
  'reviewerNote': null,
  'reviewedBy': null,
  'reviewedAt': null,
  'purgedAt': null,
  'hasDocument': true,
  'createdAt': '2026-10-16T08:00:00.000Z',
};

void main() {
  group('RunnerVerification document fields', () {
    test('hasDocument and purgedAt; no storage key is modelled', () {
      final v = RunnerVerification.fromJson(_view);
      expect(v.hasDocument, isTrue);
      expect(v.purgedAt, isNull);

      final purged = RunnerVerification.fromJson({
        ..._view,
        'status': 'approved',
        'hasDocument': false,
        'purgedAt': '2027-10-16T02:00:00.000Z',
        'documentS3Key': 'should-be-ignored',
      });
      expect(purged.hasDocument, isFalse);
      expect(purged.purgedAt, DateTime.utc(2027, 10, 16, 2));
    });

    test('older responses without the fields parse null-safe', () {
      final v = RunnerVerification.fromJson({
        'id': 'v1',
        'verificationType': 'selfie',
        'status': 'pending',
      });
      expect(v.hasDocument, isFalse);
      expect(v.purgedAt, isNull);
    });
  });

  group('VerificationDocumentRules', () {
    test('10 MB limit (row 163)', () {
      expect(VerificationDocumentRules.maxBytes, 10 * 1024 * 1024);
      expect(VerificationDocumentRules.fitsSizeLimit(0), isFalse);
      expect(VerificationDocumentRules.fitsSizeLimit(1), isTrue);
      expect(VerificationDocumentRules.fitsSizeLimit(10 * 1024 * 1024), isTrue);
      expect(
        VerificationDocumentRules.fitsSizeLimit(10 * 1024 * 1024 + 1),
        isFalse,
      );
    });

    test('content types and uploadable types', () {
      expect(
        VerificationDocumentRules.isAcceptedContentType('image/jpeg'),
        isTrue,
      );
      expect(
        VerificationDocumentRules.isAcceptedContentType('IMAGE/HEIC; q=1'),
        isTrue,
      );
      expect(
        VerificationDocumentRules.isAcceptedContentType('application/pdf'),
        isFalse,
      );
      expect(VerificationDocumentRules.uploadableTypes, {
        RunnerVerificationType.governmentId,
        RunnerVerificationType.selfie,
      });
    });
  });

  group('uploadVerificationDocument', () {
    test('sends multipart file + verificationType', () async {
      final a = _Adapter(201, _view);
      final v = await _repo(a).uploadVerificationDocument(
        RunnerVerificationType.governmentId,
        bytes: Uint8List.fromList([1, 2, 3]),
        contentType: 'image/jpeg',
      );
      expect(v.id, 'v9');
      expect(v.hasDocument, isTrue);
      final req = a.last!;
      expect(req.method, 'POST');
      expect(req.path, '/runners/me/verifications/documents');
      expect(
        '${req.headers[Headers.contentTypeHeader]}',
        startsWith('multipart/form-data'),
      );
      final form = req.data as FormData;
      expect(
        {for (final f in form.fields) f.key: f.value},
        {'verificationType': 'government_id'},
      );
      final file = form.files.single;
      expect(file.key, 'file');
      expect(file.value.length, 3);
      expect(file.value.filename, 'government_id.jpg');
      expect(file.value.contentType.toString(), 'image/jpeg');
    });

    test('selfie with a filename', () async {
      final a = _Adapter(201, {..._view, 'verificationType': 'selfie'});
      final v = await _repo(a).uploadVerificationDocument(
        RunnerVerificationType.selfie,
        bytes: Uint8List.fromList([9]),
        contentType: 'image/png',
        filename: 'me.png',
      );
      expect(v.type, RunnerVerificationType.selfie);
      final form = a.last!.data as FormData;
      expect(form.fields.single.value, 'selfie');
      expect(form.files.single.value.filename, 'me.png');
    });

    test('client-side checks refuse before sending', () {
      final a = _Adapter(201, _view);
      final repo = _repo(a);
      expect(
        () => repo.uploadVerificationDocument(
          RunnerVerificationType.paymentIdentity,
          bytes: Uint8List.fromList([1]),
          contentType: 'image/jpeg',
        ),
        throwsArgumentError,
      );
      expect(
        () => repo.uploadVerificationDocument(
          RunnerVerificationType.selfie,
          bytes: Uint8List(0),
          contentType: 'image/jpeg',
        ),
        throwsArgumentError,
      );
      expect(
        () => repo.uploadVerificationDocument(
          RunnerVerificationType.selfie,
          bytes: Uint8List(VerificationDocumentRules.maxBytes + 1),
          contentType: 'image/jpeg',
        ),
        throwsArgumentError,
      );
      expect(
        () => repo.uploadVerificationDocument(
          RunnerVerificationType.selfie,
          bytes: Uint8List.fromList([1]),
          contentType: 'application/pdf',
        ),
        throwsArgumentError,
      );
      expect(a.calls, 0);
    });

    for (final code in [
      ApiErrorCodes.verificationTypeNotUploadable,
      ApiErrorCodes.verificationDocumentTypeInvalid,
      ApiErrorCodes.verificationDocumentEmpty,
      ApiErrorCodes.verificationDocumentUploadRequired,
    ]) {
      test('surfaces $code', () async {
        final a = _Adapter(400, {
          'statusCode': 400,
          'code': code,
          'message': 'Refused',
        });
        await expectLater(
          _repo(a).uploadVerificationDocument(
            RunnerVerificationType.selfie,
            bytes: Uint8List.fromList([1]),
            contentType: 'image/jpeg',
          ),
          throwsA(
            isA<NitumeApiException>()
                .having((e) => e.code, 'code', code)
                .having((e) => e.isPayloadTooLarge, 'isPayloadTooLarge', false),
          ),
        );
      });
    }

    test('413 is flagged isPayloadTooLarge', () async {
      final a = _Adapter(413, {
        'statusCode': 413,
        'message': 'File too large',
        'error': 'Payload Too Large',
      });
      await expectLater(
        _repo(a).uploadVerificationDocument(
          RunnerVerificationType.governmentId,
          bytes: Uint8List.fromList([1]),
          contentType: 'image/webp',
        ),
        throwsA(
          isA<NitumeApiException>()
              .having((e) => e.isPayloadTooLarge, 'isPayloadTooLarge', true)
              .having((e) => e.code, 'code', isNull),
        ),
      );
    });
  });
}
