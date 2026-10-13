import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import '../utils/formatters.dart';
import 'nitume_card.dart';
import 'section_label.dart';

/// R-11. Weekly earnings bar chart (`.chart-row`), plain Flutter.
///
/// C-07 card, padding 16: C-08 [title] with an optional [total] in Fira
/// Code 13/600 on the right; seven bars Monday → Sunday (EAT week, see
/// `eatWeekStart` / `eatWeekday`), 90 tall, gap 8, rounded top; bar height
/// is the day's amount relative to the week's maximum. Bars are blue-050
/// and the [todayIndex] bar is blue: green is not decorative (OA-14).
/// Day initials `M T W T F S S` in Fira Code 10 slate-600.
///
/// Pass **runner-fee** amounts only; item reimbursements are not earnings
/// (`_shared.md` §7). Each bar is announced (`Wednesday, KSh 1,750`) and the
/// card has a text alternative listing the whole week.
class WeeklyBarChart extends StatelessWidget {
  const WeeklyBarChart({
    super.key,
    this.title = 'This week',
    required this.amounts,
    this.todayIndex,
    this.total,
  });

  final String title;

  /// Seven amounts ([num] or API decimal strings), Monday first.
  final List<Object> amounts;

  /// 0 = Monday … 6 = Sunday; `null` when the week shown is not this week.
  final int? todayIndex;

  /// Week total ([num] or decimal string); hidden when `null`.
  final Object? total;

  static const _days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  /// Chart height (bars area), as drawn.
  static const double barsHeight = 90;

  /// Smallest visible bar so empty days still show a stub.
  static const double minBarHeight = 4;

  @override
  Widget build(BuildContext context) {
    assert(amounts.length == 7, 'One amount per day, Monday first');
    assert(todayIndex == null || (todayIndex! >= 0 && todayIndex! < 7));
    final values = [
      for (final a in amounts)
        a is num ? a.toDouble() : double.tryParse('$a') ?? 0,
    ];
    final max = values.fold<double>(0, (m, v) => v > m ? v : m);
    final summary = [
      for (var i = 0; i < 7; i++) '${_days[i]} ${formatKes(amounts[i])}',
    ].join(', ');
    final radius = Radius.circular(NitumeDesignChoices.innerBoxRadius);

    return Semantics(
      container: true,
      label: '$title: $summary',
      child: NitumeCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: SectionLabel(
                    title,
                    padding: const EdgeInsets.only(bottom: 2),
                  ),
                ),
                if (total != null)
                  Text(
                    formatKes(total!),
                    style: NitumeTypography.numeric(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: barsHeight,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var i = 0; i < 7; i++) ...[
                    if (i > 0) const SizedBox(width: 8),
                    Expanded(
                      child: Semantics(
                        container: true,
                        label: '${_days[i]}, ${formatKes(amounts[i])}',
                        child: Container(
                          key: ValueKey('weekly-bar-$i'),
                          height: max <= 0
                              ? minBarHeight
                              : (values[i] / max * barsHeight).clamp(
                                  minBarHeight,
                                  barsHeight,
                                ),
                          decoration: BoxDecoration(
                            color: i == todayIndex
                                ? NitumeColors.blue
                                : NitumeColors.blue050,
                            borderRadius: BorderRadius.only(
                              topLeft: radius,
                              topRight: radius,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 6),
            ExcludeSemantics(
              child: Row(
                children: [
                  for (var i = 0; i < 7; i++) ...[
                    if (i > 0) const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _days[i][0],
                        textAlign: TextAlign.center,
                        style: NitumeTypography.numeric(
                          fontSize: 10,
                          fontWeight: FontWeight.w400,
                          color: NitumeColors.slate600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
