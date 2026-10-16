import 'package:flutter/material.dart';

import '../theme/nitume_typography.dart';
import 'num_text.dart';

/// C-08. Upper-case section label (`.sec-label`): 11.5/700 slate-600,
/// letter-spacing .05em, padding `6 20 10`.
class SectionLabel extends StatelessWidget {
  const SectionLabel(
    this.text, {
    super.key,
    this.numericSuffix,
    this.numericPrefix,
    this.padding = const EdgeInsets.fromLTRB(20, 6, 20, 10),
  });

  final String text;

  /// Optional count rendered in Fira Code after [text] and a space, e.g.
  /// `(4)` in `Photos & video (4)`.
  final String? numericSuffix;

  /// Optional count rendered in Fira Code before [text] and a space, e.g.
  /// `3` in `3 offers near you` (runner `v-jobs`).
  final String? numericPrefix;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Semantics(
        header: true,
        label: [?numericPrefix, text, ?numericSuffix].join(' '),
        excludeSemantics: true,
        child: numericSuffix == null && numericPrefix == null
            ? Text(text.toUpperCase(), style: NitumeTextStyles.sectionLabel)
            : Text.rich(
                TextSpan(
                  children: [
                    if (numericPrefix != null) NumSpan('${numericPrefix!} '),
                    TextSpan(
                      text: numericSuffix == null
                          ? text.toUpperCase()
                          : '${text.toUpperCase()} ',
                    ),
                    if (numericSuffix != null) NumSpan(numericSuffix!),
                  ],
                ),
                style: NitumeTextStyles.sectionLabel,
              ),
      ),
    );
  }
}
