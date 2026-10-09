/// First name + last-name initial (`Brian Kamau` → `Brian K.`).
///
/// **Not for runner names**: the API computes those (row 40); render
/// `RunnerSummary.shortName` as returned. Kept only for callers that still
/// need a client-side short form. Single names stay as they are (`Brian`);
/// a name already in short form is unchanged (`Brian K.`).
/// Returns `null` for a null or blank name, so callers apply the fallback
/// their spec gives (never a phone number).
String? shortName(String? displayName) {
  final parts = displayName
      ?.trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts == null || parts.isEmpty) return null;
  if (parts.length == 1) return parts.single;
  final last = parts.last.replaceAll('.', '');
  if (last.isEmpty) return parts.first;
  return '${parts.first} ${last.substring(0, 1).toUpperCase()}.';
}
