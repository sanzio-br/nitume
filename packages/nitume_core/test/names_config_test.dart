import 'package:flutter_test/flutter_test.dart';
import 'package:nitume_core/nitume_core.dart';

void main() {
  group('shortName', () {
    test('first name + last initial', () {
      expect(shortName('Brian Kamau'), 'Brian K.');
      expect(shortName('  Mary  Jane   wanjiru '), 'Mary W.');
      expect(shortName('Brian K.'), 'Brian K.');
      expect(shortName('Brian'), 'Brian');
      expect(shortName(''), isNull);
      expect(shortName('   '), isNull);
      expect(shortName(null), isNull);
    });
  });

  group('AppConfig', () {
    test('links stay hidden without an opener (SQ-2)', () async {
      final config = AppConfig(
        termsUri: Uri.parse('https://nitume.example/terms'),
        supportUri: Uri.parse('tel:+254700000000'),
      );
      expect(config.termsLink, isNull);
      expect(config.supportLink, isNull);
      expect(config.privacyLink, isNull);
      expect(await config.open(config.termsUri!), isFalse);
    });

    test('links are usable with an opener; null URIs stay hidden', () async {
      final opened = <Uri>[];
      final config = AppConfig(
        termsUri: Uri.parse('https://nitume.example/terms'),
        onOpenLink: (uri) async {
          opened.add(uri);
          return true;
        },
      );
      expect(config.termsLink, Uri.parse('https://nitume.example/terms'));
      expect(config.privacyLink, isNull);
      expect(await config.open(config.termsLink!), isTrue);
      expect(opened, [Uri.parse('https://nitume.example/terms')]);
    });

    test('opener failures resolve false', () async {
      final config = AppConfig(
        supportUri: Uri.parse('https://wa.me/254700000000'),
        onOpenLink: (_) async => throw Exception('no handler'),
      );
      expect(await config.open(config.supportLink!), isFalse);
    });

    test('environment values: blank and scheme-less become null', () {
      expect(parseConfigUri(''), isNull);
      expect(parseConfigUri('  '), isNull);
      expect(parseConfigUri('nitume.co.ke/terms'), isNull);
      expect(parseConfigUri('mailto:help@nitume.example'),
          Uri.parse('mailto:help@nitume.example'));
      final env = AppConfig.fromEnvironment();
      expect(env.termsUri, isNull);
      expect(env.supportLink, isNull);
    });
  });
}
