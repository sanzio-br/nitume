import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// `.auth-wrap`: slate, content vertically centred, horizontal padding 28,
/// scrollable so the button stays above the keyboard.
class AuthFrame extends StatelessWidget {
  const AuthFrame({super.key, required this.children, this.header});

  final List<Widget> children;

  /// Optional pushed header (C-10) for `v-auth-otp`.
  final PreferredSizeWidget? header;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: NitumeColors.slate,
      appBar: header,
      body: SafeArea(
        top: header == null,
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 24),
                  ...children,
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Auth heading 22/700 + sub copy 13 slate-600 (margin 8 / 26).
class AuthHeading extends StatelessWidget {
  const AuthHeading({super.key, required this.title, required this.sub});

  final String title;

  /// Sub copy; pass a [Text.rich] for embedded Fira Code numbers.
  final Widget sub;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          header: true,
          child: Text(title, style: NitumeTextStyles.authHeading),
        ),
        const SizedBox(height: 8),
        DefaultTextStyle.merge(style: NitumeTextStyles.muted, child: sub),
        const SizedBox(height: 26),
      ],
    );
  }
}

/// Red 12.5 inline error with an optional Fira Code part (OA-13), announced
/// as a live region. `Too many code requests. Try again in ` + `3` + ` min.`
class InlineError extends StatelessWidget {
  const InlineError(
    this.text, {
    super.key,
    this.number,
    this.suffix,
    this.textAlign = TextAlign.start,
  });

  final String text;
  final String? number;
  final String? suffix;
  final TextAlign textAlign;

  @override
  Widget build(BuildContext context) {
    final style = NitumeTextStyles.body.copyWith(
      fontSize: 12.5,
      color: NitumeDesignChoices.fieldError,
    );
    return Semantics(
      liveRegion: true,
      child: Text.rich(
        TextSpan(
          text: text,
          children: [
            if (number != null)
              TextSpan(
                text: number,
                style: NitumeTypography.numeric(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w400,
                  color: NitumeDesignChoices.fieldError,
                ),
              ),
            if (suffix != null) TextSpan(text: suffix),
          ],
        ),
        style: style,
        textAlign: textAlign,
      ),
    );
  }
}

/// Minutes to wait, rounded up (rate-limit copy).
String minutesFrom(Duration d) => '${(d.inSeconds / 60).ceil().clamp(1, 999)}';
