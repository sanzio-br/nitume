import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/nitume_typography.dart';
import 'nitume_card.dart';

/// C-17. Labelled form field (design-system `.field-label` + `.field-input`):
/// white, 8px radius, 2px green focus ring (theme). Fill and radius follow
/// `NitumeDesignChoices` (Q12).
///
/// Variants: [NitumeField.multiline], [NitumeField.money] (Fira Code, `KSh`
/// prefix, digits only), [NitumeField.phone] (Fira Code, phone keyboard).
class NitumeField extends StatelessWidget {
  const NitumeField({
    super.key,
    this.label,
    this.hint,
    this.controller,
    this.focusNode,
    this.keyboardType,
    this.textInputAction,
    this.minLines,
    this.maxLines = 1,
    this.numeric = false,
    this.prefixText,
    this.prefixIcon,
    this.suffixIcon,
    this.errorText,
    this.onChanged,
    this.onSubmitted,
    this.onTap,
    this.readOnly = false,
    this.enabled = true,
    this.autofocus = false,
    this.autofillHints,
    this.inputFormatters,
    this.maxLength,
  });

  /// Multi-line description field (3 rows by default).
  const NitumeField.multiline({
    super.key,
    this.label,
    this.hint,
    this.controller,
    this.focusNode,
    this.minLines = 3,
    this.maxLines = 6,
    this.errorText,
    this.onChanged,
    this.enabled = true,
    this.autofocus = false,
    this.maxLength,
  })  : keyboardType = TextInputType.multiline,
        textInputAction = TextInputAction.newline,
        numeric = false,
        prefixText = null,
        prefixIcon = null,
        suffixIcon = null,
        onSubmitted = null,
        onTap = null,
        readOnly = false,
        autofillHints = null,
        inputFormatters = null;

  /// Whole-shilling amount, Fira Code, `KSh ` prefix.
  NitumeField.money({
    super.key,
    this.label,
    this.hint,
    this.controller,
    this.focusNode,
    this.textInputAction,
    this.errorText,
    this.onChanged,
    this.onSubmitted,
    this.enabled = true,
    this.autofocus = false,
  })  : keyboardType = TextInputType.number,
        minLines = null,
        maxLines = 1,
        numeric = true,
        prefixText = 'KSh ',
        prefixIcon = null,
        suffixIcon = null,
        onTap = null,
        readOnly = false,
        autofillHints = null,
        inputFormatters = [FilteringTextInputFormatter.digitsOnly],
        maxLength = null;

  /// Phone number, Fira Code, phone keyboard.
  NitumeField.phone({
    super.key,
    this.label,
    this.hint,
    this.controller,
    this.focusNode,
    this.textInputAction = TextInputAction.done,
    this.errorText,
    this.onChanged,
    this.onSubmitted,
    this.enabled = true,
    this.autofocus = false,
  })  : keyboardType = TextInputType.phone,
        minLines = null,
        maxLines = 1,
        numeric = true,
        prefixText = null,
        prefixIcon = null,
        suffixIcon = null,
        onTap = null,
        readOnly = false,
        autofillHints = const [AutofillHints.telephoneNumber],
        inputFormatters = [
          FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]')),
        ],
        maxLength = null;

  final String? label;
  final String? hint;
  final TextEditingController? controller;
  final FocusNode? focusNode;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final int? minLines;
  final int? maxLines;

  /// Renders the input in Fira Code.
  final bool numeric;
  final String? prefixText;
  final Widget? prefixIcon;
  final Widget? suffixIcon;
  final String? errorText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onTap;
  final bool readOnly;
  final bool enabled;
  final bool autofocus;
  final Iterable<String>? autofillHints;
  final List<TextInputFormatter>? inputFormatters;
  final int? maxLength;

  @override
  Widget build(BuildContext context) {
    final inputStyle = numeric
        ? NitumeTypography.numeric(fontSize: 14.5, fontWeight: FontWeight.w400)
        : NitumeTextStyles.fieldInput;
    final field = TextField(
      controller: controller,
      focusNode: focusNode,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      minLines: minLines,
      maxLines: maxLines,
      maxLength: maxLength,
      style: inputStyle,
      readOnly: readOnly,
      enabled: enabled,
      autofocus: autofocus,
      autofillHints: autofillHints,
      inputFormatters: inputFormatters,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      onTap: onTap,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: inputStyle.copyWith(
          color: Theme.of(context).inputDecorationTheme.hintStyle?.color,
        ),
        prefixText: prefixText,
        prefixStyle: inputStyle,
        prefixIcon: prefixIcon,
        suffixIcon: suffixIcon,
        errorText: errorText,
        errorMaxLines: 3,
      ),
    );
    if (label == null) return field;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label!, style: NitumeTextStyles.fieldLabel),
        const SizedBox(height: 6),
        field,
      ],
    );
  }
}

/// Form card (`.form-card` + `.form-label`): a [NitumeCard] with an
/// upper-case 11/700 label above one control. Margin `0 20 14` is the
/// caller's.
class NitumeFormCard extends StatelessWidget {
  const NitumeFormCard({super.key, required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return NitumeCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Semantics(
            header: true,
            label: label,
            excludeSemantics: true,
            child: Text(label.toUpperCase(), style: NitumeTextStyles.cardLabel),
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}
