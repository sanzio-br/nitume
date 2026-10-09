import 'package:flutter/widgets.dart';

import 'nitume_colors.dart';
import 'status_tone.dart';

/// Styling choices where the mockup and `docs/design/nitume_design_system.html`
/// disagreed, kept in one place so screens never restyle them inline.
///
/// Question ids refer to `docs/audits/customer-gap-report.md` ("Questions for
/// the owner (consolidated)") and `docs/specs/customer/_shared.md` §8. Each
/// constant says whether the owner has **decided** it or whether it is still
/// **open**. Only open constants may change without a new owner answer.
abstract final class NitumeDesignChoices {
  // ---------------------------------------------------------------- Q11 radius

  /// Q11 / Q-RADIUS, **decided**: pill buttons from the design system
  /// (`.btn`, 999). The mockup's 14 / 10px CTAs are not used.
  static const double buttonRadius = NitumeRadii.pill;

  /// Card / row radius, design system `.card-demo` `--r-m` 14. Mockup rows
  /// (12) and `.active-card` / `.map-box` (16) are not design-system values;
  /// Q14 (**decided**) says use the nearest design-system token.
  static const double cardRadius = NitumeRadii.medium;

  /// Small boxes inside rows (category icon box, notification icon box, OTP
  /// boxes, evidence thumbs). Mockup 9 / 10; nearest design-system radius is
  /// `--r-s` 8 (Q14, **decided**).
  static const double innerBoxRadius = NitumeRadii.small;

  // ----------------------------------------------------------------- Q12 field

  /// Q12 / Q-FIELD, **decided**: design-system `.field-input`, white fill.
  static const Color fieldFill = NitumeColors.white;

  /// Q12, **decided**: design-system `--r-s` 8. Focus ring is 2px green
  /// (theme `focusedBorder`).
  static const double fieldRadius = NitumeRadii.small;

  // ------------------------------------------------------- Q13 red/amber usage

  /// Q13 / Q-ENROUTE, **decided**: amber (`StatusTone.pending`) for the
  /// RUNNER_EN_ROUTE chip. The other runner-progress states (assigned,
  /// arrived, in progress) stay info per `_shared.md` §6.
  static const StatusTone enRouteTone = StatusTone.pending;

  /// Q13 / Q-RED, **decided**: red (`StatusTone.danger`) for the Cancelled
  /// chip.
  static const StatusTone cancelledTone = StatusTone.danger;

  /// EXPIRED tone. `_shared.md` §6 allows "pending or info" and the state is
  /// not drawn in the mockup. Info (nothing for the customer to act on).
  static const StatusTone expiredTone = StatusTone.info;

  /// Q13 / Q-RED, **decided**: red label text on destructive menu rows
  /// ("Log out", "Report a problem with this task").
  static const Color destructiveText = NitumeColors.red;

  /// Q13 / Q-RED, **decided**: red unread dot on the notification bell, with
  /// the mockup's 1.5px white ring.
  static const Color unreadDot = NitumeColors.red;

  /// Q13 / Q-RED, **decided**: red inline form error text and error border.
  static const Color fieldError = NitumeColors.red;

  /// Q13, **decided**: amber text for price-change amounts (the new item
  /// price and the difference on the price-change sheet). Use with
  /// `NumText` / `NitumeTypography.numeric(color: priceChangeAmount)`.
  static const Color priceChangeAmount = NitumeColors.amber;

  // ------------------------------------------- Q14 off-palette mockup colours

  /// Q14, **decided**: nearest design-system token. Tag on the blue
  /// active-task card; mockup `rgba(4,175,77,.2)` + `#5FE092` → chip-info.
  static const StatusTone activeCardTagTone = StatusTone.info;

  /// Q14, **decided**: nearest design-system token. Meta line on the blue
  /// active-task card; mockup `#AEB9CC` → slate-400.
  static const Color activeCardMeta = NitumeColors.slate400;

  /// Q14, **decided**: floating elements over the map (ETA chip) use a
  /// slate-line hairline instead of the mockup's off-palette black shadow.
  static const bool overlayUsesHairline = true;

  // ------------------------------------------------------------ modal scrim

  /// **Open** (SQ-1, `_shared.md` §2 / §9). Barrier colour behind
  /// `NitumeDialog` (C-35). The design system has no scrim token; the
  /// proposal, used until the owner answers, is Deep Trust Blue `#0B2545`
  /// at 50% opacity (alpha `0x80`), a derived tone of an existing colour.
  /// Material's default black barrier is never used.
  static const Color modalScrim = Color(0x800B2545);

  // ------------------------------------------------------- accessibility (open)

  /// **Open** (BOARD row 33). The design-system chip pairs measure below WCAG
  /// AA 4.5:1 for 12px text: success 4.01, pending 2.95, danger 4.36 (info
  /// 13.1 passes). `false` = design system exactly. `true` = blue label text
  /// on the same tint (13.2–13.9:1), dot keeps the tone colour. Palette-only
  /// either way.
  static const bool chipHighContrastText = false;
}
