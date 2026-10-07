import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../auth/otp_policy.dart';
import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';

/// C-26. One-time code entry (`.otp-row`): [length] boxes 44×52, gap 8,
/// Fira Code 18/600; filled boxes get a green border, empty ones show `•`.
///
/// Error state: pass [errorText] (e.g. `That code is incorrect or has
/// expired.`); every box gets a red border and the text shows under the
/// boxes in red (Q13, decided). Map API errors with
/// `OtpErrorKind.fromApiException`; when `requiresNewCode` is true, set
/// [enabled] to false until a new code is requested.
///
/// Backed by a single hidden [TextField] so SMS autofill
/// ([AutofillHints.oneTimeCode]) and paste work.
class OtpCodeField extends StatefulWidget {
  const OtpCodeField({
    super.key,
    this.length = OtpPolicy.codeLength,
    this.controller,
    this.onChanged,
    this.onCompleted,
    this.autofocus = true,
    this.enabled = true,
    this.semanticLabel = 'Verification code',
    this.errorText,
  });

  final int length;
  final TextEditingController? controller;
  final ValueChanged<String>? onChanged;

  /// Called once all [length] digits are entered.
  final ValueChanged<String>? onCompleted;
  final bool autofocus;
  final bool enabled;
  final String semanticLabel;

  /// Inline error under the boxes; `null` = no error.
  final String? errorText;

  @override
  State<OtpCodeField> createState() => _OtpCodeFieldState();
}

class _OtpCodeFieldState extends State<OtpCodeField> {
  late TextEditingController _controller =
      widget.controller ?? TextEditingController();
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onText);
  }

  @override
  void didUpdateWidget(OtpCodeField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      _controller.removeListener(_onText);
      if (oldWidget.controller == null) _controller.dispose();
      _controller = widget.controller ?? TextEditingController();
      _controller.addListener(_onText);
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_onText);
    if (widget.controller == null) _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onText() => setState(() {});

  void _changed(String value) {
    widget.onChanged?.call(value);
    if (value.length == widget.length) widget.onCompleted?.call(value);
  }

  @override
  Widget build(BuildContext context) {
    final code = _controller.text;
    final hasError = widget.errorText != null;
    final boxes = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < widget.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Container(
            key: ValueKey('otp-box-$i'),
            width: 44,
            height: 52,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: NitumeColors.white,
              borderRadius: BorderRadius.circular(
                NitumeDesignChoices.innerBoxRadius,
              ),
              border: Border.all(
                color: hasError
                    ? NitumeDesignChoices.fieldError
                    : i < code.length
                    ? NitumeColors.green
                    : NitumeColors.slateLine,
              ),
            ),
            child: Text(
              i < code.length ? code[i] : '•',
              style: NitumeTypography.numeric(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: i < code.length
                    ? NitumeColors.blue
                    : NitumeColors.slate400,
              ),
            ),
          ),
        ],
      ],
    );

    final field = Semantics(
      label: widget.semanticLabel,
      textField: true,
      value: code,
      child: Stack(
        children: [
          ExcludeSemantics(child: boxes),
          Positioned.fill(
            child: Opacity(
              opacity: 0,
              child: TextField(
                key: const ValueKey('otp-input'),
                controller: _controller,
                focusNode: _focusNode,
                enabled: widget.enabled,
                autofocus: widget.autofocus,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.oneTimeCode],
                maxLength: widget.length,
                showCursor: false,
                enableSuggestions: false,
                autocorrect: false,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                onChanged: _changed,
                decoration: const InputDecoration(
                  counterText: '',
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  filled: false,
                ),
              ),
            ),
          ),
        ],
      ),
    );
    // Always a Column so toggling the error keeps the hidden TextField (and
    // its focus) in place.
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        field,
        if (hasError) ...[
          const SizedBox(height: 8),
          Semantics(
            liveRegion: true,
            child: Text(
              widget.errorText!,
              key: const ValueKey('otp-error'),
              textAlign: TextAlign.center,
              style: NitumeTextStyles.mutedSmall.copyWith(
                fontSize: 12,
                color: NitumeDesignChoices.fieldError,
              ),
            ),
          ),
        ],
      ],
    );
  }
}
