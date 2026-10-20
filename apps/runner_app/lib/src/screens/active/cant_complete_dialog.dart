import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// `Can't complete this task?` copy (proposed, `v-active.md` Confirm
/// dialogs).
abstract final class CantCompleteCopy {
  static const title = "Can't complete this task?";
  static const body =
      "The task will be marked as failed and our team will follow up. "
      "There's no runner fee for a failed task.";
  static const reasons = [
    "Can't reach the location",
    'Safety concern',
    'Vehicle or personal emergency',
    'Other',
  ];
  static const otherHint = 'Tell us what happened';
  static const otherError = 'Write 5 to 300 characters.';
  static const confirm = 'Mark as failed';
  static const cancel = 'Keep going';
}

/// C-35 dialog with a `NitumeRadioRow` reason group; `Other` adds a
/// required text (5–300). Resolves with the transition note (the reason
/// label, plus the text for `Other`), or `null` when kept.
class CantCompleteDialog extends StatefulWidget {
  const CantCompleteDialog({super.key});

  static Future<String?> show(BuildContext context) =>
      NitumeDialog.show<String>(
        context,
        builder: (_) => const CantCompleteDialog(),
      );

  @override
  State<CantCompleteDialog> createState() => _CantCompleteDialogState();
}

class _CantCompleteDialogState extends State<CantCompleteDialog> {
  String? _reason;
  final _other = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _other.dispose();
    super.dispose();
  }

  bool get _isOther => _reason == CantCompleteCopy.reasons.last;

  void _confirm() {
    final reason = _reason;
    if (reason == null) return;
    if (_isOther) {
      final text = _other.text.trim();
      if (text.length < 5 || text.length > 300) {
        setState(() => _error = CantCompleteCopy.otherError);
        return;
      }
      Navigator.of(context).pop('$reason: $text');
      return;
    }
    Navigator.of(context).pop(reason);
  }

  @override
  Widget build(BuildContext context) {
    return NitumeDialog(
      title: CantCompleteCopy.title,
      body: CantCompleteCopy.body,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 10),
          for (final (i, r) in CantCompleteCopy.reasons.indexed) ...[
            if (i > 0) const SizedBox(height: 8),
            NitumeRadioRow(
              label: r,
              selected: _reason == r,
              onSelected: () => setState(() {
                _reason = r;
                _error = null;
              }),
            ),
          ],
          if (_isOther) ...[
            const SizedBox(height: 10),
            NitumeField.multiline(
              hint: CantCompleteCopy.otherHint,
              controller: _other,
              minLines: 2,
              maxLines: 4,
              errorText: _error,
              onChanged: (_) {
                if (_error != null) setState(() => _error = null);
              },
            ),
          ],
        ],
      ),
      actions: [
        NitumeButton.outline(
          label: CantCompleteCopy.confirm,
          destructive: true,
          onPressed: _reason == null ? null : _confirm,
        ),
        NitumeButton.primary(
          label: CantCompleteCopy.cancel,
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}
