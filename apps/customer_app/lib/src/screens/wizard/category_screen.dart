import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../widgets/common.dart';
import 'details_screen.dart';
import 'task_draft.dart';

/// Route names of the wizard steps; all start with [Routes.newTask] so a
/// successful submit can pop the whole wizard.
abstract final class WizardRoutes {
  static const details = '${Routes.newTask}/details';
  static const review = '${Routes.newTask}/review';

  static bool isWizard(Route<dynamic> r) =>
      r.settings.name?.startsWith(Routes.newTask) ?? false;
}

/// `v-new-category`: step 1, pick one of the five MVP categories.
class CategoryScreen extends StatefulWidget {
  const CategoryScreen({super.key, this.initialCategory});

  final ErrandCategory? initialCategory;

  @override
  State<CategoryScreen> createState() => _CategoryScreenState();
}

class _CategoryScreenState extends State<CategoryScreen> {
  late final TaskDraft _draft = TaskDraft(category: widget.initialCategory);
  late final AppServices _services = context.services;

  @override
  void dispose() {
    // Leaving the wizard after a DRAFT was created but not submitted:
    // DRAFT → CANCELLED (OA-9) so no orphan draft remains.
    final id = _draft.createdErrandId;
    if (id != null && !_draft.submitted) {
      _services.errands
          .transition(id, ErrandStatus.cancelled)
          .then((_) {}, onError: (Object _) {});
    }
    super.dispose();
  }

  Future<void> _back() async {
    if (!_draft.hasData) {
      Navigator.of(context).pop();
      return;
    }
    final discard = await confirmDiscardTask(context);
    if (discard && mounted) Navigator.of(context).pop();
  }

  void _continue() {
    Navigator.of(context)
        .push(
          MaterialPageRoute<void>(
            settings: const RouteSettings(name: WizardRoutes.details),
            builder: (_) => DetailsScreen(draft: _draft),
          ),
        )
        .then((_) {
          // Step 2 may have added data: refresh the discard guard.
          if (mounted) setState(() {});
        });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_draft.hasData,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: PushedScaffold(
        title: 'New task',
        step: 1,
        onBack: _back,
        body: ListView(
          children: [
            const StepProgressBar(total: 3, completed: 1),
            const SectionLabel(
              'What do you need done?',
              padding: EdgeInsets.fromLTRB(20, 0, 20, 10),
            ),
            CategoryGrid(
              selected: _draft.category,
              onSelected: (c) => setState(() => _draft.changeCategory(c)),
            ),
          ],
        ),
        cta: FixedCta(
          child: NitumeButton.primary(
            label: 'Continue →',
            expand: true,
            onPressed: _draft.category == null ? null : _continue,
          ),
        ),
      ),
    );
  }
}

/// Discard dialog (v-new-category, proposed copy).
Future<bool> confirmDiscardTask(BuildContext context) =>
    showNitumeConfirmDialog(
      context,
      title: 'Discard this task?',
      body: "What you've entered so far will be lost.",
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    );
