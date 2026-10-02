/// Kenyan phone number helpers, mirroring `normalizePhone` in
/// `apps/api/src/auth/otp.service.ts`.
abstract final class KenyanPhone {
  static final RegExp _pattern = RegExp(r'^(?:\+?254|0)([17]\d{8})$');

  static bool isValid(String input) => _pattern.hasMatch(input.trim());

  /// Normalises `0712…`, `254712…` or `+254712…` to `+254712…`.
  /// Throws [FormatException] on an invalid number.
  static String normalize(String input) {
    final match = _pattern.firstMatch(input.trim());
    if (match == null) {
      throw const FormatException('Enter a valid Kenyan number');
    }
    return '+254${match.group(1)}';
  }

  /// `+254712345678` → `0712 345 678` for display.
  static String format(String input) {
    final normalized = normalize(input);
    final local = '0${normalized.substring(4)}';
    return '${local.substring(0, 4)} ${local.substring(4, 7)} ${local.substring(7)}';
  }
}
