import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// Phase of an STK screen once the prompt is being sent.
enum StkPhase { initiating, initiateError, stk }

/// Copy that differs between the fee STK (`v-payment`) and the item-amount
/// STK (`x-merchant-payment` variant B).
class StkCopy {
  const StkCopy({
    required this.purpose,
    required this.successHeading,
    required this.successBody,
  });

  /// Ends the prompt sentence: `to confirm this payment.`
  final String purpose;
  final String successHeading;
  final String successBody;

  /// `v-payment`.
  static const fees = StkCopy(
    purpose: ' to confirm this payment.',
    successHeading: 'Payment received',
    successBody: "Thanks. We're finding a runner for your task.",
  );

  /// `x-merchant-payment` variant B.
  static const items = StkCopy(
    purpose: ' to pay for the items.',
    successHeading: 'Item amount paid',
    successBody: 'Thanks. Your runner can go ahead with the purchase.',
  );
}

/// One STK block shared by `v-payment` and `x-merchant-payment` variant B
/// (`.stk-wrap`): icon circle, heading, body, Fira Code amount, pulsing
/// dots while PENDING and the state's buttons (OA-21, row 52).
class StkStatusView extends StatelessWidget {
  const StkStatusView({
    super.key,
    this.copy = StkCopy.fees,
    this.onDone,
    this.caption,
    this.failureReason,
    required this.phase,
    required this.stk,
    required this.payer,
    required this.amount,
    required this.busy,
    required this.stillPending,
    required this.onCheck,
    required this.onInitiate,
    required this.onNewAttempt,
    required this.onBack,
  });

  final StkPhase phase;
  final StkCopy copy;

  /// SUCCESS button (`Done`); none when `null` (v-payment auto-leaves).
  final VoidCallback? onDone;

  /// Optional 12.5 line under the amount.
  final Widget? caption;

  /// Provider failure reason, shown under the FAILED body.
  final String? failureReason;
  final StkPaymentState stk;
  final String? payer;
  final String? amount;
  final bool busy;
  final bool stillPending;
  final VoidCallback onCheck;
  final VoidCallback onInitiate;
  final VoidCallback onNewAttempt;
  final VoidCallback onBack;

  Widget _promptBody() {
    if (payer == null) {
      return Text(
        'Enter your M-Pesa PIN on the prompt sent to your phone'
        '${copy.purpose}',
      );
    }
    return Text.rich(
      TextSpan(
        text: 'Enter your M-Pesa PIN on the prompt sent to ',
        children: [
          TextSpan(
            text: payer,
            style: NitumeTypography.numeric(
              fontSize: 13,
              fontWeight: FontWeight.w400,
              color: NitumeColors.slate600,
            ),
          ),
          TextSpan(text: copy.purpose),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final String heading;
    final Widget body;
    final List<Widget> buttons;
    var icon = _Icon.phone;
    var dots = false;

    if (phase == StkPhase.initiating) {
      heading = 'Check your phone';
      body = _promptBody();
      buttons = [
        const NitumeButton.primary(label: 'Sending prompt…', onPressed: null),
      ];
    } else if (phase == StkPhase.initiateError) {
      heading = "Couldn't send the prompt";
      body = const Text('Check your connection and try again.');
      icon = _Icon.failed;
      buttons = [
        NitumeButton.primary(label: 'Try again', onPressed: onInitiate),
        NitumeButton.outline(label: 'Back', onPressed: onBack),
      ];
    } else {
      switch (stk) {
        case StkPaymentState.pending:
          heading = 'Check your phone';
          body = _promptBody();
          dots = true;
          buttons = [
            NitumeButton.primary(
              label: "I've paid — continue",
              loading: busy,
              onPressed: onCheck,
            ),
          ];
        case StkPaymentState.success:
          heading = copy.successHeading;
          body = Text(copy.successBody);
          icon = _Icon.success;
          buttons = [
            if (onDone != null)
              NitumeButton.primary(label: 'Done', onPressed: onDone),
          ];
        case StkPaymentState.failed:
          heading = "Payment didn't go through";
          final reason = failureReason?.trim();
          // The provider's reason (e.g. "Request cancelled by user") as a
          // second line, when it gave one.
          body = Text(
            "M-Pesa didn't confirm this payment. You haven't been charged. "
            'You can try again.'
            '${reason == null || reason.isEmpty ? '' : '\n$reason'}',
          );
          icon = _Icon.failed;
          buttons = [
            NitumeButton.primary(label: 'Try again', onPressed: onNewAttempt),
            NitumeButton.outline(label: 'Back', onPressed: onBack),
          ];
        case StkPaymentState.timeout:
          heading = 'Still checking your payment';
          body = const Text(
            "M-Pesa hasn't confirmed yet. If you entered your PIN, don't pay "
            "again. We'll update this screen as soon as we hear back.",
          );
          buttons = [
            NitumeButton.primary(
              label: 'Check again',
              loading: busy,
              onPressed: onCheck,
            ),
            NitumeButton.outline(
              label: 'Send a new prompt',
              onPressed: busy ? null : onNewAttempt,
            ),
          ];
      }
    }

    return LayoutBuilder(
      builder: (context, c) => SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 30),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: c.maxHeight),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _StateIcon(icon),
              const SizedBox(height: 20),
              Semantics(
                liveRegion: true,
                header: true,
                child: Text(
                  heading,
                  textAlign: TextAlign.center,
                  style: NitumeTextStyles.dialogTitle.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 260),
                child: DefaultTextStyle.merge(
                  textAlign: TextAlign.center,
                  style: NitumeTextStyles.muted,
                  child: body,
                ),
              ),
              const SizedBox(height: 22),
              if (amount != null) ...[
                NumText.kes(amount!, fontSize: 30, fontWeight: FontWeight.w600),
                if (caption != null) ...[const SizedBox(height: 8), caption!],
                const SizedBox(height: 26),
              ],
              if (dots) ...[
                const PulsingDots(
                  semanticLabel: 'Waiting for M-Pesa confirmation',
                ),
                const SizedBox(height: 30),
              ],
              SizedBox(
                width: 220,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < buttons.length; i++) ...[
                      if (i > 0) const SizedBox(height: 10),
                      buttons[i],
                    ],
                  ],
                ),
              ),
              if (stillPending && stk == StkPaymentState.pending) ...[
                const SizedBox(height: 12),
                Text(
                  "We haven't heard from M-Pesa yet. Keep this screen open.",
                  textAlign: TextAlign.center,
                  style: NitumeTextStyles.muted.copyWith(fontSize: 12.5),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

enum _Icon { phone, success, failed }

/// 64px circle: green-050 + green phone (waiting), green-050 + green check
/// (success), slate + slate-line border + blue phone (failed; red is not
/// allowed here, OA-13).
class _StateIcon extends StatelessWidget {
  const _StateIcon(this.kind);

  final _Icon kind;

  @override
  Widget build(BuildContext context) {
    final failed = kind == _Icon.failed;
    return ExcludeSemantics(
      child: Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: failed ? NitumeColors.slate : NitumeColors.green050,
          border: failed ? Border.all(color: NitumeColors.slateLine) : null,
        ),
        child: Icon(
          kind == _Icon.success
              ? Icons.check_rounded
              : Icons.phone_iphone_rounded,
          size: 28,
          color: failed ? NitumeColors.blue : NitumeColors.green,
        ),
      ),
    );
  }
}
