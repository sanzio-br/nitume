import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// Evidence type label (`x-evidence-viewer` captions).
String evidenceTypeLabel(EvidenceType type) => switch (type) {
  EvidenceType.photo => 'Photo',
  EvidenceType.video => 'Video',
  EvidenceType.receipt => 'Receipt',
  EvidenceType.document => 'Document',
  EvidenceType.signature => 'Signature',
};

DateTime? _time(Evidence e) => e.capturedAt ?? e.createdAt;

/// Grid thumbnails with alt text `Photo, 10:41 AM`. URLs may be null
/// (signed links pending row 25): the tile shows its placeholder.
List<EvidenceThumbnail> evidenceThumbnails(List<Evidence> items) => [
  for (final e in items)
    EvidenceThumbnail(
      imageUrl: e.isVideo ? null : e.url,
      isVideo: e.isVideo,
      semanticLabel: _time(e) == null
          ? evidenceTypeLabel(e.type)
          : '${evidenceTypeLabel(e.type)}, ${formatClock(_time(e)!)}',
    ),
];

/// Opens `x-evidence-viewer` at [index]. Signed links are short-lived
/// (row 25): when one has expired the list is re-fetched once first (via
/// [refetch]). Video is deferred from MVP (row 32): video items show the
/// poster and a note.
Future<void> openEvidenceViewer(
  BuildContext context,
  List<Evidence> items,
  int index, {
  Future<List<Evidence>> Function()? refetch,
}) async {
  if (refetch != null && items.any((e) => e.isUrlExpired())) {
    try {
      final fresh = await refetch();
      if (fresh.length == items.length) items = fresh;
    } on Object {
      // Keep the old list; the tile shows its load-failure state.
    }
    if (!context.mounted) return;
  }
  final shown = items;
  return EvidenceViewer.show(
    context,
    items: evidenceThumbnails(shown),
    initialIndex: index,
    captionBuilder: (context, i) {
      final e = shown[i];
      final t = _time(e);
      final white = NitumeTextStyles.body.copyWith(
        fontSize: 12,
        color: NitumeColors.white,
      );
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              text: evidenceTypeLabel(e.type),
              children: [
                if (t != null)
                  TextSpan(
                    text: ' · ${formatClock(t)}',
                    style: NitumeTypography.numeric(
                      fontSize: 12,
                      fontWeight: FontWeight.w400,
                      color: NitumeColors.white,
                    ),
                  ),
              ],
            ),
            style: white,
          ),
          if (e.isVideo) ...[
            const SizedBox(height: 4),
            Text(
              "Video playback isn't available yet.",
              style: white.copyWith(fontSize: 12.5),
            ),
          ],
        ],
      );
    },
  );
}
