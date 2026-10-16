import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

void main() {
  group('RunnerSkill', () {
    test('uses the six category wire values in category order', () {
      expect(
        [for (final s in RunnerSkill.values) s.wire],
        [
          'buy_for_me',
          'pickup_delivery',
          'inspection',
          'representation',
          'queue_admin',
          'business',
        ],
      );
      for (final s in RunnerSkill.values) {
        expect(s.wire, s.category.wire);
        expect(s.label, s.category.label);
        expect(RunnerSkill.tryFromWire(s.wire), s);
      }
      expect(RunnerSkill.getItForMe.label, 'Get It For Me');
      expect(RunnerSkill.waitForMe.category, ErrandCategory.waitForMe);
    });

    test('offered is the five MVP skills (no Business Tasks)', () {
      expect(RunnerSkill.offered, hasLength(5));
      expect(RunnerSkill.offered, isNot(contains(RunnerSkill.businessTasks)));
    });

    test('unknown values never throw', () {
      expect(RunnerSkill.tryFromWire('shopping'), isNull);
      expect(RunnerSkill.tryFromWire(null), isNull);
      expect(RunnerSkill.tryFromWire(3), isNull);
      expect(
        RunnerSkill.listFromWire([
          'queue_admin',
          'documents',
          'buy_for_me',
          null,
          'buy_for_me',
          7,
        ]),
        [RunnerSkill.buyForMe, RunnerSkill.waitForMe],
      );
      expect(RunnerSkill.listFromWire(null), isEmpty);
      expect(RunnerSkill.listFromWire('buy_for_me'), isEmpty);
    });

    test('public profile skips unknown skills', () {
      final p = RunnerPublicProfile.fromJson({
        'id': 'rp1',
        'verificationLevel': '2_id_verified',
        'avgRating': '4.50',
        'errandsCompleted': 3,
        'availability': 'online',
        'skills': ['business_errands', 'representation'],
        'serviceAreas': ['Nyali'],
      });
      expect(p.skills, [RunnerSkill.goThereForMe]);
    });
  });

  test('RunnerAvailability.tryFromWire', () {
    expect(RunnerAvailability.tryFromWire('busy'), RunnerAvailability.busy);
    expect(RunnerAvailability.tryFromWire('away'), isNull);
    expect(RunnerAvailability.tryFromWire(null), isNull);
  });
}
