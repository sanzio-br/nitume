import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

import 'helpers/fake_api.dart';

Future<NitumeApiException> _error(Map<String, Object?> body) async {
  final a = FakeApiAdapter({
    'PATCH /errands/e1/status': (body['statusCode']! as int, body),
  });
  try {
    await RunnerJobsRepository(fakeClient(a)).transition(
      'e1',
      from: ErrandStatus.inProgress,
      to: ErrandStatus.awaitingCustomer,
    );
  } on NitumeApiException catch (e) {
    return e;
  }
  fail('expected an error');
}

void main() {
  test('codes', () {
    expect(ApiErrorCodes.evidenceRequired, 'evidence_required');
    expect(ApiErrorCodes.evidenceTypeNotAllowed, 'evidence_type_not_allowed');
    expect(ApiErrorCodes.evidenceNotAllowed, 'evidence_not_allowed');
    expect(
      ApiErrorCodes.reimbursementWindowClosed,
      'reimbursement_window_closed',
    );
  });

  test('evidence_required: missing', () async {
    final e = await _error({
      'statusCode': 409,
      'code': 'evidence_required',
      'message': 'Upload the required evidence before finishing',
      'missing': ['photo', 'receipt', 'hologram'],
    });
    expect(e.code, ApiErrorCodes.evidenceRequired);
    expect(e.missingEvidence, [EvidenceType.photo, EvidenceType.receipt]);
  });

  test('evidence_type_not_allowed: allowed type and content type', () async {
    final e = await _error({
      'statusCode': 400,
      'code': 'evidence_type_not_allowed',
      'message': 'Runners upload photos and receipt photos only',
      'allowed': {
        'type': ['photo', 'receipt'],
        'contentType': 'image/*',
      },
    });
    expect(e.allowedEvidenceTypes, [EvidenceType.photo, EvidenceType.receipt]);
    expect(e.allowedEvidenceContentType, 'image/*');
  });

  test('evidence_not_allowed: status and type', () async {
    final e = await _error({
      'statusCode': 409,
      'code': 'evidence_not_allowed',
      'message': 'A photo cannot be uploaded while the task is CANCELLED',
      'status': 'CANCELLED',
      'type': 'photo',
    });
    expect(e.evidenceRefusedStatus, ErrandStatus.cancelled);
    expect(e.evidenceRefusedType, EvidenceType.photo);
  });

  test('reimbursement_window_closed: endedAt and windowEndsAt', () async {
    final e = await _error({
      'statusCode': 409,
      'code': 'reimbursement_window_closed',
      'message': 'closed',
      'endedAt': '2026-10-18T09:00:00.000Z',
      'windowEndsAt': '2026-10-19T09:00:00.000Z',
    });
    expect(e.jobEndedAt, DateTime.utc(2026, 10, 18, 9));
    expect(e.receiptWindowEndsAt, DateTime.utc(2026, 10, 19, 9));
  });

  test('absent details read as null', () {
    const e = NitumeApiException(message: 'x', statusCode: 409);
    expect(e.missingEvidence, isNull);
    expect(e.allowedEvidenceTypes, isNull);
    expect(e.allowedEvidenceContentType, isNull);
    expect(e.evidenceRefusedStatus, isNull);
    expect(e.evidenceRefusedType, isNull);
    expect(e.jobEndedAt, isNull);
    expect(e.receiptWindowEndsAt, isNull);
  });
}
