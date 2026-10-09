/// Opens an external link. Returns `false` when it could not be opened (the
/// caller shows its spec's snackbar).
typedef LinkOpener = Future<bool> Function(Uri uri);

/// Build-time app configuration: external links (`x-support`, `x-legal`)
/// and feature flags.
///
/// Every link is optional. A link is usable only when its URI is set **and**
/// an [onOpenLink] opener is supplied (`openExternalLink`, `url_launcher`,
/// row 39). Callers hide the row (Support) or render plain text (legal
/// line) when the `*Link` getter is `null`.
class AppConfig {
  const AppConfig({
    this.termsUri,
    this.privacyUri,
    this.supportUri,
    this.onOpenLink,
    this.quotePreviewEnabled = false,
    this.placesApiKey,
    this.mapsEnabled = false,
  });

  /// Reads `--dart-define=NITUME_TERMS_URL`, `NITUME_PRIVACY_URL` and
  /// `NITUME_SUPPORT_URI`. Blank or scheme-less values become `null`.
  /// `NITUME_QUOTE_PREVIEW=true` turns on [quotePreviewEnabled].
  /// `NITUME_PLACES_API_KEY` sets [placesApiKey]; `NITUME_MAPS_ENABLED=true`
  /// turns on [mapsEnabled].
  factory AppConfig.fromEnvironment({LinkOpener? onOpenLink}) => AppConfig(
    termsUri: parseConfigUri(const String.fromEnvironment('NITUME_TERMS_URL')),
    privacyUri: parseConfigUri(
      const String.fromEnvironment('NITUME_PRIVACY_URL'),
    ),
    supportUri: parseConfigUri(
      const String.fromEnvironment('NITUME_SUPPORT_URI'),
    ),
    onOpenLink: onOpenLink,
    quotePreviewEnabled: const bool.fromEnvironment('NITUME_QUOTE_PREVIEW'),
    placesApiKey: _blankToNull(
      const String.fromEnvironment('NITUME_PLACES_API_KEY'),
    ),
    mapsEnabled: const bool.fromEnvironment('NITUME_MAPS_ENABLED'),
  );

  /// Terms of Service page.
  final Uri? termsUri;

  /// Privacy Policy page.
  final Uri? privacyUri;

  /// Support target: `https:` (web / `wa.me`), `tel:` or `mailto:`. The app
  /// does not branch on the scheme.
  final Uri? supportUri;

  /// Opens a link outside the app, normally `openExternalLink`.
  final LinkOpener? onOpenLink;

  /// Row 47: the wizard's non-authoritative price preview is hidden until
  /// real pricing rates exist. While `false` (default) `v-new-review` makes
  /// no preview call and shows no price (`_shared.md` §8.3).
  final bool quotePreviewEnabled;

  /// Google Places API key for `GooglePlaceSearchService` (row 30). `null`
  /// in builds without one: Places is unavailable and the screens use their
  /// saved-address fallback.
  final String? placesApiKey;

  /// True when the build has a Google Maps SDK key in its platform config
  /// (AndroidManifest / AppDelegate). Dart cannot see that key, so the build
  /// says so with `NITUME_MAPS_ENABLED=true`. While `false`,
  /// `LiveTrackingMap` keeps its placeholder body (row 30).
  final bool mapsEnabled;

  Uri? _usable(Uri? uri) => onOpenLink == null ? null : uri;

  /// [termsUri] when it can be opened, else `null`.
  Uri? get termsLink => _usable(termsUri);

  /// [privacyUri] when it can be opened, else `null`.
  Uri? get privacyLink => _usable(privacyUri);

  /// [supportUri] when it can be opened, else `null` (hide the Support row).
  Uri? get supportLink => _usable(supportUri);

  /// Opens [uri] through [onOpenLink]; `false` when there is no opener or it
  /// failed.
  Future<bool> open(Uri uri) async {
    final opener = onOpenLink;
    if (opener == null) return false;
    try {
      return await opener(uri);
    } on Exception {
      return false;
    }
  }
}

String? _blankToNull(String value) {
  final v = value.trim();
  return v.isEmpty ? null : v;
}

/// Parses a configured link; blank or scheme-less values give `null`.
Uri? parseConfigUri(String? value) {
  final trimmed = value?.trim() ?? '';
  if (trimmed.isEmpty) return null;
  final uri = Uri.tryParse(trimmed);
  if (uri == null || !uri.hasScheme) return null;
  return uri;
}
