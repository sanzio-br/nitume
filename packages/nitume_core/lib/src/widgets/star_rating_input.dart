import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';

/// C-27. Five-star rating (`.stars`): 30px stars, filled green, empty
/// slate-line. Each star has a 48dp hit area (so the visual gap is wider
/// than the mockup's 6px). `onChanged == null` makes it read-only.
class StarRatingInput extends StatelessWidget {
  const StarRatingInput({
    super.key,
    required this.value,
    required this.onChanged,
    this.starSize = 30,
  }) : assert(value >= 0 && value <= 5);

  /// 0 = nothing chosen.
  final int value;
  final ValueChanged<int>? onChanged;
  final double starSize;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Rating',
      value: '$value of 5',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 1; i <= 5; i++)
            Semantics(
              button: onChanged != null,
              selected: i <= value,
              label: '$i star${i == 1 ? '' : 's'}',
              excludeSemantics: true,
              child: InkResponse(
                key: ValueKey('star-$i'),
                onTap: onChanged == null ? null : () => onChanged!(i),
                radius: 24,
                child: SizedBox.square(
                  dimension: 48,
                  child: Icon(
                    Icons.star_rounded,
                    size: starSize,
                    color: i <= value
                        ? NitumeColors.green
                        : NitumeColors.slateLine,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
