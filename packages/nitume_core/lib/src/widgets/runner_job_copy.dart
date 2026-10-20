/// Runner price-change copy. Use these constants verbatim; never re-type
/// the text.
abstract final class RunnerPriceChangeCopy {
  /// Owner row 248 (2026-10-20), approved: shown while
  /// `RunnerJobView.differenceAwaitingPayment` is set (an approved
  /// `send_to_runner` increase whose difference the customer has not paid).
  static const differenceAwaitingPayment =
      'Approved. Waiting for the customer to pay the difference.';
}

/// Runner evidence-upload copy.
abstract final class RunnerEvidenceCopy {
  /// PROPOSED, needs design-auditor confirmation (no spec copy yet for
  /// `v-evidence-capture`): answer to a 413 `evidence_too_large` (row 252).
  /// Evidence is camera-only, so it says "take it again" (the ID screens'
  /// row-163 line also offers a smaller gallery photo). Render the size
  /// with [tooLargeLimit] as a Fira Code span.
  static String tooLarge(int maxBytes) =>
      'This photo is larger than ${tooLargeLimit(maxBytes)}. Take it again.';

  /// The limit for [tooLarge], e.g. `10 MB` for 10 × 1024 × 1024 bytes
  /// (whole MB when exact, else one decimal).
  static String tooLargeLimit(int maxBytes) {
    const mb = 1024 * 1024;
    if (maxBytes % mb == 0) return '${maxBytes ~/ mb} MB';
    return '${(maxBytes / mb).toStringAsFixed(1)} MB';
  }
}
