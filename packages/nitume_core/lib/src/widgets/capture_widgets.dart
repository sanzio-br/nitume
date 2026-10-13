import 'package:flutter/material.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import 'nitume_button.dart';
import 'nitume_card.dart';
import 'status_chip.dart';
import '../theme/status_tone.dart';

/// R-13. Capture drop zone (`.upload-box`): C-07 dashed card (2px
/// slate-line dashes, card radius, white), centred 36px outline [icon] in
/// blue and a [caption] in 12.5 slate-600.
///
/// UI only: tapping calls [onPick]; the screen opens the camera (or a
/// picker sheet). [busy] disables it and shows a spinner while an upload
/// runs. [height]: 220 (ID), 260 (selfie), 240 (evidence).
class CaptureDropZone extends StatelessWidget {
  const CaptureDropZone({
    super.key,
    required this.caption,
    required this.onPick,
    this.icon = Icons.photo_camera_outlined,
    this.height = 220,
    this.busy = false,
    this.semanticLabel,
  });

  /// `Tap to take a photo`, `Tap to take a photo or upload`.
  final String caption;
  final VoidCallback? onPick;
  final IconData icon;
  final double height;
  final bool busy;

  /// Button label for screen readers (`Take a photo of your ID front`);
  /// defaults to [caption].
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final enabled = onPick != null && !busy;
    return SizedBox(
      height: height,
      child: Semantics(
        button: true,
        enabled: enabled,
        label: semanticLabel ?? caption,
        excludeSemantics: true,
        child: NitumeCard(
          border: NitumeCardBorder.dashed,
          dashedBorderWidth: 2,
          padding: const EdgeInsets.all(16),
          onTap: enabled ? onPick : null,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (busy)
                  const SizedBox.square(
                    dimension: 36,
                    child: Padding(
                      padding: EdgeInsets.all(6),
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: NitumeColors.blue,
                      ),
                    ),
                  )
                else
                  Icon(icon, size: 36, color: NitumeColors.blue),
                const SizedBox(height: 10),
                Text(
                  caption,
                  textAlign: TextAlign.center,
                  style: NitumeTextStyles.mutedSmall.copyWith(fontSize: 12.5),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Upload state of a [CaptureThumbnail].
enum CaptureState {
  /// Nothing captured yet: flat blue-050 tile with an outline icon.
  empty,

  /// Captured, upload running: spinner over the photo.
  uploading,

  /// Uploaded: green check badge (a complete state).
  uploaded,

  /// Upload failed: `Not uploaded` danger chip and `Retry` under the tile.
  failed,
}

/// R-15. Capture thumbnail (`.doc-thumb`) with its upload state.
///
/// [aspectRatio] 1.4 for ID documents, 1 for evidence; inner-box radius.
/// [image] is the local capture (e.g. `FileImage`), `null` while [state] is
/// [CaptureState.empty]. [label] (`Front`, `Back`) shows on the empty tile
/// in 11/600 slate-600 under [emptyIcon]. Optional [caption] (capture time,
/// `10:31 AM`) renders in Fira Code 11 under the tile.
///
/// [onRemove] adds a 48dp retake / remove icon button in the corner
/// ([removeLabel], default `Retake`). [onRetry] wires the `Retry` link on a
/// failed upload. [onTap] opens the viewer.
class CaptureThumbnail extends StatelessWidget {
  const CaptureThumbnail({
    super.key,
    required this.state,
    this.image,
    this.label,
    this.emptyIcon = Icons.badge_outlined,
    this.aspectRatio = 1,
    this.caption,
    this.onTap,
    this.onRemove,
    this.removeLabel = 'Retake',
    this.onRetry,
    this.semanticLabel,
  });

  final CaptureState state;
  final ImageProvider? image;
  final String? label;
  final IconData emptyIcon;
  final double aspectRatio;
  final String? caption;
  final VoidCallback? onTap;
  final VoidCallback? onRemove;
  final String removeLabel;
  final VoidCallback? onRetry;

  /// Spoken name (`ID front`, `Photo 2 of 3`); defaults to [label].
  final String? semanticLabel;

  static const _stateWords = {
    CaptureState.empty: 'not captured',
    CaptureState.uploading: 'uploading',
    CaptureState.uploaded: 'uploaded',
    CaptureState.failed: 'not uploaded',
  };

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(NitumeDesignChoices.innerBoxRadius);
    final img = image;
    final Widget body = state == CaptureState.empty || img == null
        ? ColoredBox(
            color: NitumeColors.blue050,
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(emptyIcon, size: 26, color: NitumeColors.blue),
                  if (label != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      label!,
                      style: NitumeTextStyles.chip.copyWith(
                        fontSize: 11,
                        color: NitumeColors.slate600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          )
        : Image(image: img, fit: BoxFit.cover);

    final tile = AspectRatio(
      aspectRatio: aspectRatio,
      child: ClipRRect(
        borderRadius: radius,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Material(
              color: NitumeColors.blue050,
              child: InkWell(onTap: onTap, child: body),
            ),
            if (state == CaptureState.uploading)
              const Center(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: NitumeColors.white,
                    shape: BoxShape.circle,
                  ),
                  child: Padding(
                    padding: EdgeInsets.all(8),
                    child: SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: NitumeColors.blue,
                      ),
                    ),
                  ),
                ),
              ),
            if (state == CaptureState.uploaded)
              Positioned(
                left: 6,
                bottom: 6,
                child: Container(
                  key: const ValueKey('capture-uploaded-badge'),
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: NitumeColors.green,
                    shape: BoxShape.circle,
                    border: Border.all(color: NitumeColors.white, width: 2),
                  ),
                  child: const Icon(
                    Icons.check_rounded,
                    size: 12,
                    color: NitumeColors.white,
                  ),
                ),
              ),
            if (onRemove != null && state != CaptureState.empty)
              Positioned(
                top: 0,
                right: 0,
                child: IconButton(
                  onPressed: onRemove,
                  tooltip: removeLabel,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints.tightFor(
                    width: NitumeSpacing.minTapTarget,
                    height: NitumeSpacing.minTapTarget,
                  ),
                  icon: Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: NitumeColors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: NitumeColors.slateLine),
                    ),
                    child: const Icon(
                      Icons.refresh_rounded,
                      size: 16,
                      color: NitumeColors.blue,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );

    final name = semanticLabel ?? label;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          container: true,
          image: state != CaptureState.empty,
          label: [?name, _stateWords[state]!, ?caption].join(', '),
          child: tile,
        ),
        if (caption != null && state != CaptureState.failed) ...[
          const SizedBox(height: 4),
          ExcludeSemantics(child: Text(caption!, style: NitumeTextStyles.meta)),
        ],
        if (state == CaptureState.failed) ...[
          const SizedBox(height: 6),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 4,
            children: [
              const StatusChip(
                label: 'Not uploaded',
                tone: StatusTone.danger,
                size: StatusChipSize.compact,
              ),
              if (onRetry != null)
                NitumeButton.link(label: 'Retry', onPressed: onRetry),
            ],
          ),
        ],
      ],
    );
  }
}

/// R-15 row: thumbnails side by side in equal columns with a 10px gap
/// (`.doc-thumb-row`, ID front + back).
class CaptureThumbnailRow extends StatelessWidget {
  const CaptureThumbnailRow({super.key, required this.children});

  final List<CaptureThumbnail> children;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(child: children[i]),
        ],
      ],
    );
  }
}
