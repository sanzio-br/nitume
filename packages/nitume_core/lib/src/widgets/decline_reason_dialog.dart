import 'package:flutter/material.dart';

import '../api/api_exception.dart';
import '../models/runner_job.dart';
import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';
import 'nitume_button.dart';
import 'nitume_choice_chip.dart';
import 'nitume_dialog.dart';

/// Every runner-facing string of the R-23 [DeclineReasonDialog]. All of it
/// is proposed copy (`docs/specs/runner/v-jobs.md` "Decline reason
/// picker"); change it here only.
abstract final class DeclineReasonCopy {
  static const title = 'Decline this job?';
  static const body = "We'll offer it to another runner.";

  /// Body when the offer is over the runner's purchase limit (row 113:
  /// over-limit declines are not penalised).
  static const bodyOverLimit =
      "This job needs a purchase above your limit. We'll offer it to another "
      "runner. This won't count against you.";
  static const reasonsLabel = 'Why are you declining?';
  static const decline = 'Decline';
  static const keepOffer = 'Keep offer';

  /// Announced on the disabled `Decline` button.
  static const chooseReasonFirst = 'Choose a reason first';

  /// 400 `decline_reason_invalid`.
  static const errorReasonInvalid = 'Choose a reason.';

  /// 409 `purchase_within_limit` (the limit was raised after the offer).
  static const errorWithinLimit =
      'Your purchase limit now covers this job. Choose another reason.';

  /// Any other failure.
  static const errorGeneric = "Couldn't decline. Try again.";

  /// Snackbar the screen shows after [DeclineReasonOutcome.offerUnavailable].
  static const offerUnavailable = 'That offer is no longer available.';

  /// Row label for [reason].
  static String reason(OfferDeclineReason reason) => switch (reason) {
    OfferDeclineReason.overPurchaseLimit => 'Above my purchase limit',
    OfferDeclineReason.tooFar => 'Too far away',
    OfferDeclineReason.notAvailable => 'Not available right now',
    OfferDeclineReason.other => 'Other reason',
  };
}

/// How a [DeclineReasonDialog] ended.
enum DeclineReasonOutcome {
  /// The decline went through: remove the offer card (no snackbar); on
  /// `v-job-detail` go back to `v-jobs`.
  declined,

  /// 409 `offer_expired` or 404: the offer is gone. Remove the card and show
  /// [DeclineReasonCopy.offerUnavailable].
  offerUnavailable,

  /// `Keep offer`, scrim tap or back: nothing changes.
  kept,
}

/// R-23 (row 210). The decline confirmation with a reason picker, one
/// component for `v-jobs` and `v-job-detail`.
///
/// C-35 [NitumeDialog] shell, unchanged: title, body (over-limit variant when
/// [overPurchaseLimit]), the label [DeclineReasonCopy.reasonsLabel] and one
/// radio group of C-16 [NitumeRadioRow]s (selected = blue fill, white
/// label). `Above my purchase limit` is listed first and pre-selected only
/// when [overPurchaseLimit]. Actions: outline `Decline` (never red or green)
/// then primary `Keep offer`.
///
/// [onDecline] performs `POST /errands/:id/decline` (usually
/// `RunnerJobsRepository.decline`); the dialog maps its
/// [NitumeApiException]s to the spec's inline errors and outcomes.
///
/// Open it with [DeclineReasonDialog.show].
class DeclineReasonDialog extends StatefulWidget {
  const DeclineReasonDialog({
    super.key,
    required this.overPurchaseLimit,
    required this.onDecline,
    this.reasonRequired = true,
  });

  /// The offer is over the runner's purchase limit
  /// (`RunnerJobView.overPurchaseLimit`): shows and pre-selects
  /// `Above my purchase limit` and the over-limit body.
  final bool overPurchaseLimit;

  /// Sends the decline with the chosen reason (`null` only when
  /// [reasonRequired] is false and none was chosen). Throw the API error to
  /// keep the dialog open with an inline message.
  final Future<void> Function(OfferDeclineReason? reason) onDecline;

  /// When true (the spec's proposal; BOARD row 229 is open) `Decline` stays
  /// disabled until a reason is chosen. When false the runner may decline
  /// without one (a general decline; the API keeps the reason optional).
  final bool reasonRequired;

  /// Shows the dialog; resolves [DeclineReasonOutcome.kept] when dismissed.
  static Future<DeclineReasonOutcome> show(
    BuildContext context, {
    required bool overPurchaseLimit,
    required Future<void> Function(OfferDeclineReason? reason) onDecline,
    bool reasonRequired = true,
  }) async {
    final outcome = await NitumeDialog.show<DeclineReasonOutcome>(
      context,
      builder: (_) => DeclineReasonDialog(
        overPurchaseLimit: overPurchaseLimit,
        onDecline: onDecline,
        reasonRequired: reasonRequired,
      ),
    );
    return outcome ?? DeclineReasonOutcome.kept;
  }

  @override
  State<DeclineReasonDialog> createState() => _DeclineReasonDialogState();
}

class _DeclineReasonDialogState extends State<DeclineReasonDialog> {
  late bool _overLimitShown = widget.overPurchaseLimit;
  late OfferDeclineReason? _selected = widget.overPurchaseLimit
      ? OfferDeclineReason.overPurchaseLimit
      : null;
  bool _busy = false;
  String? _error;

  List<OfferDeclineReason> get _reasons => [
    if (_overLimitShown) OfferDeclineReason.overPurchaseLimit,
    OfferDeclineReason.tooFar,
    OfferDeclineReason.notAvailable,
    OfferDeclineReason.other,
  ];

  bool get _canDecline =>
      !_busy && (!widget.reasonRequired || _selected != null);

  void _select(OfferDeclineReason reason) {
    if (_busy) return;
    setState(() {
      _selected = reason;
      _error = null;
    });
  }

  Future<void> _decline() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onDecline(_selected);
      if (mounted) Navigator.of(context).pop(DeclineReasonOutcome.declined);
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      if (e.code == ApiErrorCodes.offerExpired || e.statusCode == 404) {
        Navigator.of(context).pop(DeclineReasonOutcome.offerUnavailable);
        return;
      }
      setState(() {
        _busy = false;
        if (e.code == ApiErrorCodes.purchaseWithinLimit) {
          _overLimitShown = false;
          if (_selected == OfferDeclineReason.overPurchaseLimit) {
            _selected = null;
          }
          _error = DeclineReasonCopy.errorWithinLimit;
        } else if (e.code == ApiErrorCodes.declineReasonInvalid) {
          _error = DeclineReasonCopy.errorReasonInvalid;
        } else {
          _error = DeclineReasonCopy.errorGeneric;
        }
      });
    } on Object {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = DeclineReasonCopy.errorGeneric;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final canDecline = _canDecline;
    return PopScope(
      canPop: !_busy,
      child: NitumeDialog(
        title: DeclineReasonCopy.title,
        // C-35 body style, unchanged (ruling 2026-10-19).
        body: widget.overPurchaseLimit
            ? DeclineReasonCopy.bodyOverLimit
            : DeclineReasonCopy.body,
        content: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Label margin-top 14 (C-35 adds 4 above the content).
            const SizedBox(height: 10),
            Text(
              DeclineReasonCopy.reasonsLabel,
              style: NitumeTextStyles.chip.copyWith(color: NitumeColors.blue),
            ),
            const SizedBox(height: 8),
            for (final (i, reason) in _reasons.indexed) ...[
              if (i > 0) const SizedBox(height: 8),
              NitumeRadioRow(
                key: ValueKey('decline-reason-${reason.wire}'),
                label: DeclineReasonCopy.reason(reason),
                selected: _selected == reason,
                onSelected: () => _select(reason),
              ),
            ],
          ],
        ),
        actions: [
          // One node: the button announces why it is disabled.
          MergeSemantics(
            child: Semantics(
              hint: !_busy && !canDecline
                  ? DeclineReasonCopy.chooseReasonFirst
                  : null,
              child: NitumeButton.outline(
                label: DeclineReasonCopy.decline,
                loading: _busy,
                onPressed: canDecline ? _decline : null,
              ),
            ),
          ),
          NitumeButton.primary(
            label: DeclineReasonCopy.keepOffer,
            onPressed: _busy
                ? null
                : () => Navigator.of(context).pop(DeclineReasonOutcome.kept),
          ),
        ],
        error: _error,
      ),
    );
  }
}
