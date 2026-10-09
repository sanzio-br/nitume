/// Opens an external link. Returns `false` when it could not be opened (the
/// caller shows its spec's snackbar).
typedef LinkOpener = Future<bool> Function(Uri uri);

/// Build-time app configuration for the external links (`x-support`,
/// `x-legal`).
///
/// Every link is optional. A link is usable only when its URI is set **and**
/// an [onOpenLink] opener is supplied: the launcher package is not approved
/// yet (SQ-2), so the apps pass none and every `*Link` getter returns `null`.
/// Callers hide the row (Support) or render plain text (legal line) when the
/// getter is `null`.
class AppConfig {
  const AppConfig({
    this.termsUri,
    this.privacyUri,
    this.supportUri,
    this.onOpenLink,
  });

  /// Reads `--dart-define=NITUME_TERMS_URL`, `NITUME_PRIVACY_URL` and
  /// `NITUME_SUPPORT_URI`. Blank or scheme-less values become `null`.
  factory AppConfig.fromEnvironment({LinkOpener? onOpenLink}) => AppConfig(
    termsUri: parseConfigUri(const String.fromEnvironment('NITUME_TERMS_URL')),
    privacyUri: parseConfigUri(
      const String.fromEnvironment('NITUME_PRIVACY_URL'),
    ),
    supportUri: parseConfigUri(
      const String.fromEnvironment('NITUME_SUPPORT_URI'),
    ),
    onOpenLink: onOpenLink,
  );

  /// Terms of Service page.
  final Uri? termsUri;

  /// Privacy Policy page.
  final Uri? privacyUri;

  /// Support target: `https:` (web / `wa.me`), `tel:` or `mailto:`. The app
  /// does not branch on the scheme.
  final Uri? supportUri;

  /// Opens a link outside the app. `null` until a launcher is approved.
  final LinkOpener? onOpenLink;

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

/// Parses a configured link; blank or scheme-less values give `null`.
Uri? parseConfigUri(String? value) {
  final trimmed = value?.trim() ?? '';
  if (trimmed.isEmpty) return null;
  final uri = Uri.tryParse(trimmed);
  if (uri == null || !uri.hasScheme) return null;
  return uri;
}
