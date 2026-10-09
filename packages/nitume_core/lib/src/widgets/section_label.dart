import 'package:flutter/material.dart';

import '../theme/nitume_typography.dart';

/// C-08. Upper-case section label (`.sec-label`): 11.5/700 slate-600,
/// letter-spacing .05em, padding `6 20 10`.
class SectionLabel extends StatelessWidget {
  const SectionLabel(
    this.text, {
    super.key,
    this.padding = const EdgeInsets.fromLTRB(20, 6, 20, 10),
  });

  final String text;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Semantics(
        header: true,
        label: text,
        excludeSemantics: true,
        child: Text(text.toUpperCase(), style: NitumeTextStyles.sectionLabel),
      ),
    );
  }
}
