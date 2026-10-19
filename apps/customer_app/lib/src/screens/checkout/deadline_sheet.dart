import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/app_services.dart';
import '../../widgets/deadline_widgets.dart';
import '../wizard/task_draft.dart';

/// How the new-deadline sheet closed.
sealed class DeadlineSheetResult {
  const DeadlineSheetResult();
}

/// The customer saved a deadline ([errand] is the PATCH answer).
final class DeadlineSaved extends DeadlineSheetResult {
  const DeadlineSaved(this.errand);

  final Errand errand;
}

/// The task is paid meanwhile (`deadline_not_editable`): reload it and
/// route per the Entry rules.
final class DeadlineReload extends DeadlineSheetResult {
  const DeadlineReload();
}

/// Choose-a-new-deadline sheet (`x-awaiting-quote`, rows 237, 242–244): the
/// `v-new-details` chips `Today` (hidden after 23:59 local), `Tomorrow` and
/// `Flexible`. Tapping a chip saves it (`PATCH /errands/:id { deadlineAt }`;
/// `Flexible` sends `null`, its clock starting at payment). The quote is
/// kept. Resolves with `null` when dismissed.
Future<DeadlineSheetResult?> showDeadlineSheet(
  BuildContext context, {
  required Errand errand,
}) => showModalBottomSheet<DeadlineSheetResult>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => _DeadlineSheet(errand: errand),
);

class _DeadlineSheet extends StatefulWidget {
  const _DeadlineSheet({required this.errand});

  final Errand errand;

  @override
  State<_DeadlineSheet> createState() => _DeadlineSheetState();
}

class _DeadlineSheetState extends State<_DeadlineSheet> {
  late final AppServices _services = context.services;
  late DeadlineChoice? _selected = DeadlineChoice.matching(
    widget.errand.deadlineAt,
    DateTime.now(),
  );
  ErrandDefaults? _defaults;
  bool _saving = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _services.errands
        .defaults()
        .then((d) {
          if (mounted) setState(() => _defaults = d);
        })
        // No value: the Flexible caption stays hidden.
        .catchError((Object _) {});
  }

  Future<void> _save(DeadlineChoice choice) async {
    final navigator = Navigator.of(context);
    if (choice == _selected && !_failed) {
      // Already the task's deadline: nothing to change.
      navigator.pop();
      return;
    }
    setState(() {
      _selected = choice;
      _saving = true;
      _failed = false;
    });
    try {
      final updated = await _services.errands.setDeadline(
        widget.errand.id,
        choice.deadlineFrom(DateTime.now()),
      );
      if (mounted) navigator.pop(DeadlineSaved(updated));
    } on Object catch (e) {
      if (!mounted) return;
      final problem = e is NitumeApiException ? e.deadlineProblem : null;
      if (problem == DeadlineProblem.notEditable) {
        navigator.pop(const DeadlineReload());
        return;
      }
      // deadline_in_past (e.g. `Today` just after 23:59, now hidden),
      // customer-only or a network error: stay and let the customer retry.
      setState(() {
        _saving = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final caption = flexibleDeadlineDefault(_defaults);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text('Deadline', style: NitumeTextStyles.dialogTitle),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final c in DeadlineChoice.values)
                  if (c.isAvailableAt(now))
                    NitumeChoiceChip(
                      label: c.label,
                      selected: _selected == c,
                      onSelected: _saving ? null : () => _save(c),
                    ),
              ],
            ),
            if (_selected == DeadlineChoice.flexible && caption != null)
              FlexibleDeadlineCaption(duration: caption),
            if (_saving) ...[
              const SizedBox(height: 16),
              const Center(child: PulsingDots(semanticLabel: 'Saving')),
            ],
            if (_failed) ...[
              const SizedBox(height: 14),
              const NitumeNotice(
                tone: NitumeNoticeTone.danger,
                message: "Couldn't change the deadline. Try again.",
              ),
            ],
          ],
        ),
      ),
    );
  }
}
