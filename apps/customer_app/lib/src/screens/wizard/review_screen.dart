import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../navigation/nav.dart';
import '../../services/app_services.dart';
import '../../widgets/common.dart';
import 'category_screen.dart';
import 'task_draft.dart';

/// `v-new-review`: step 3, submit the task for its authoritative quote
/// (OA-3). Nothing is paid here.
///
/// The synchronous quote-preview endpoint does not exist (BOARD row 47, no
/// pricing rules), so the screen always shows the spec's "estimate
/// unavailable" state instead of the estimate rows.
class ReviewScreen extends StatefulWidget {
  const ReviewScreen({super.key, required this.draft});

  final TaskDraft draft;

  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  bool _submitting = false;

  TaskDraft get _d => widget.draft;

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() => _submitting = true);
    final services = context.services;
    final navigator = Navigator.of(context);
    try {
      // Create the DRAFT once; a retry only re-submits the same id.
      var id = _d.createdErrandId;
      if (id == null) {
        final created = await services.errands.create(
          _d.toRequest(DateTime.now()),
        );
        id = created.errand.id;
        _d.createdErrandId = id;
      }
      final title = _d.title.trim();
      if (title.isNotEmpty && !_d.titleSaved) {
        // TODO(core-ui): send `title` in CreateErrandRequest (the API
        // accepts it); until then it is set right after creation.
        await services.errands.updateTitle(id, title);
        _d.titleSaved = true;
      }
      await services.errands.submit(id);
      _d.submitted = true;
      if (!mounted) return;
      navigator.popUntil((r) => !WizardRoutes.isWizard(r));
      await Nav.toAwaitingQuote(navigator.context, id);
    } on NitumeApiException catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      if (e.statusCode == 400 && _d.createdErrandId == null) {
        showSnack(context, e.message);
        navigator.pop();
        return;
      }
      showSnack(context, "Couldn't send your task. Try again.");
    }
  }

  @override
  Widget build(BuildContext context) {
    final budget = _d.hasBudget ? _d.budget ?? 0 : 0;
    final preview = context.services.appConfig.quotePreviewEnabled;
    const itemLine =
        'Paid separately from the fees. You choose how after your quote is '
        'ready.';
    return PopScope(
      canPop: !_submitting,
      child: PushedScaffold(
        title: 'Review',
        step: 3,
        onBack: _submitting ? () {} : null,
        body: ListView(
          children: [
            const StepProgressBar(total: 3, completed: 3),
            if (!preview) ...[
              // Variant A (row 47): no price and no preview call until
              // pricing rates exist.
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 0, 20, 14),
                child: NitumeNotice(
                  message:
                      "We'll send your final quote after you submit. You "
                      "won't pay anything until you accept it.",
                ),
              ),
              if (budget > 0)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                  child: NitumeFormCard(
                    label: 'Item budget',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        ReceiptRow(label: 'Item budget', amount: budget),
                        const ReceiptCaption(itemLine),
                      ],
                    ),
                  ),
                ),
            ] else
              // Variant B: no preview endpoint exists yet (api-contract),
              // so the card shows its "estimate unavailable" state.
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                child: NitumeFormCard(
                  label: 'Estimated price',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const NitumeNotice(
                        message:
                            "We couldn't estimate the price right now. You "
                            "can still submit; we'll send you the final "
                            'quote.',
                      ),
                      if (budget > 0)
                        ReceiptSeparateGroup(
                          rows: [
                            ReceiptRow(label: 'Item budget', amount: budget),
                          ],
                          note: itemLine,
                        ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        cta: FixedCta(
          child: NitumeButton.primary(
            label: 'Submit task →',
            expand: true,
            loading: _submitting,
            onPressed: _submit,
          ),
        ),
      ),
    );
  }
}
