import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';

/// C-31 ETA chip (`.eta-chip`): white pill, Fira Code 11.5/700. Uses a
/// slate-line hairline instead of the mockup's black shadow (Q14).
class EtaChip extends StatelessWidget {
  const EtaChip({super.key, required this.label});

  /// `ETA 12 min` (see `formatEta`) or `Arrived`.
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: NitumeColors.white,
        borderRadius: BorderRadius.circular(NitumeRadii.pill),
        border: NitumeDesignChoices.overlayUsesHairline
            ? Border.all(color: NitumeColors.slateLine)
            : null,
      ),
      child: Text(
        label,
        style: NitumeTypography.numeric(
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// C-31. Map frame for live tracking (`.map-box`): 220px tall, rounded,
/// ETA chip at (14, 14).
///
/// The map itself is supplied by [mapBuilder]: pass
/// `GoogleTrackingMap.builderFor(config, ...)` (Google Maps, row 30), which
/// is `null` in builds without a maps key. Without a builder the frame shows
/// the blue-050 placeholder (`v-track`: no grid, no image).
class LiveTrackingMap extends StatelessWidget {
  const LiveTrackingMap({
    super.key,
    this.mapBuilder,
    this.etaLabel,
    this.height = 220,
    this.semanticLabel = 'Map showing the runner',
  });

  final WidgetBuilder? mapBuilder;
  final String? etaLabel;
  final double height;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeDesignChoices.cardRadius);
    return SizedBox(
      height: height,
      child: DecoratedBox(
        position: DecorationPosition.foreground,
        decoration: BoxDecoration(
          borderRadius: radius,
          border: Border.all(color: NitumeColors.slateLine),
        ),
        child: ClipRRect(
          borderRadius: radius,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Semantics(
                label: semanticLabel,
                image: true,
                child: mapBuilder?.call(context) ??
                    const ColoredBox(
                      key: ValueKey('map-placeholder'),
                      color: NitumeColors.blue050,
                    ),
              ),
              if (etaLabel != null)
                Positioned(top: 14, left: 14, child: EtaChip(label: etaLabel!)),
            ],
          ),
        ),
      ),
    );
  }
}
