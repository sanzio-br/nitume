import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';

/// Wordmark (auth screens): 9px green dot + "Nitume" 22/700, gap 9.
/// Whether the green dot counts as a brand mark is v-auth-phone Q1.
///
/// R-17: an optional [suffix] (the runner app passes `Runner`) follows the
/// name in 12/600 slate-600 on the same baseline (`.auth-logo` in
/// `nitume_runner_app.html`). Without it the wordmark is unchanged.
class NitumeWordmark extends StatelessWidget {
  const NitumeWordmark({super.key, this.suffix});

  /// Product suffix such as `Runner`; `null` shows the plain wordmark.
  final String? suffix;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: suffix == null ? 'Nitume' : 'Nitume $suffix',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 9,
            height: 9,
            decoration: const BoxDecoration(
              color: NitumeColors.green,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 9),
          if (suffix == null)
            Text('Nitume', style: NitumeTextStyles.authHeading)
          else
            Text.rich(
              TextSpan(
                text: 'Nitume ',
                style: NitumeTextStyles.authHeading,
                children: [
                  TextSpan(
                    text: suffix,
                    style: NitumeTextStyles.authHeading.copyWith(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: NitumeColors.slate600,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Waiting indicator (`.stk-dots`): three 7px slate-400 dots blinking every
/// 1.2s, staggered by 0.2s. Static when animations are disabled.
class PulsingDots extends StatefulWidget {
  const PulsingDots({super.key, this.semanticLabel = 'Waiting'});

  final String semanticLabel;

  @override
  State<PulsingDots> createState() => _PulsingDotsState();
}

class _PulsingDotsState extends State<PulsingDots>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reduce) {
      _controller.stop();
      _controller.value = 0;
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  // CSS `blink`: opacity 1 → .2 → 1 over the period.
  double _opacity(int i) {
    final t = (_controller.value - i * (200 / 1200)) % 1.0;
    final wave = (t < 0.5 ? t : 1 - t) * 2; // 0 → 1 → 0
    return 1 - 0.8 * wave;
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: widget.semanticLabel,
      excludeSemantics: true,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < 3; i++) ...[
              if (i > 0) const SizedBox(width: 6),
              Opacity(
                opacity: _opacity(i),
                child: Container(
                  width: 7,
                  height: 7,
                  decoration: const BoxDecoration(
                    color: NitumeColors.slate400,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
