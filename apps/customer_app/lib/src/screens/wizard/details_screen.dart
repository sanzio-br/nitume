import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/app_services.dart';
import '../../services/saved_place_search.dart';
import '../../widgets/common.dart';
import 'category_screen.dart';
import 'review_screen.dart';
import 'task_draft.dart';

enum _F { title, description, first, dropoff, items, budget }

/// `v-new-details`: step 2, what / where / when / budget (OA-15, OA-19).
class DetailsScreen extends StatefulWidget {
  const DetailsScreen({super.key, required this.draft});

  final TaskDraft draft;

  @override
  State<DetailsScreen> createState() => _DetailsScreenState();
}

class _DetailsScreenState extends State<DetailsScreen> {
  TaskDraft get _d => widget.draft;
  late final _title = TextEditingController(text: _d.title);
  late final _description = TextEditingController(text: _d.description);
  late final _budget = TextEditingController(
    text: _d.budget == null || _d.budget == 0 ? '' : '${_d.budget}',
  );
  final _keys = {for (final f in _F.values) f: GlobalKey()};
  bool _showErrors = false;
  List<SavedAddress> _saved = const [];

  @override
  void initState() {
    super.initState();
    context.services.account
        .addresses()
        .then((list) {
          if (mounted) setState(() => _saved = list);
        })
        .catchError((Object _) {});
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _budget.dispose();
    super.dispose();
  }

  Map<_F, String> _validate() {
    final e = <_F, String>{};
    final title = _d.title.trim();
    if (title.length > 60) {
      e[_F.title] = 'Keep the title under 60 characters.';
    } else if (title.isNotEmpty && title.length < 3) {
      // The API needs 3–120 characters for a title.
      e[_F.title] = 'Use at least 3 characters, or leave it empty.';
    }
    if (_d.description.trim().length < 5) {
      e[_F.description] = 'Tell the runner a bit more (at least 5 characters).';
    }
    if (_d.first == null) {
      e[_F.first] = switch (_d.category) {
        ErrandCategory.getItForMe => 'Choose where to pick up.',
        ErrandCategory.buyForMe => 'Choose where to buy.',
        _ => 'Choose a location.',
      };
    }
    if (_d.twoPoints && _d.dropoff == null) {
      e[_F.dropoff] = 'Choose where to deliver.';
    }
    if (_d.isBuy && _d.namedItems.isEmpty) {
      e[_F.items] = 'Add at least one item.';
    }
    final budget = _d.budget ?? 0;
    if (budget > 1000000) {
      e[_F.budget] = 'Enter an amount up to KSh 1,000,000.';
    } else if (_d.isBuy && budget <= 0) {
      e[_F.budget] = 'Enter a budget for the items.';
    }
    return e;
  }

  void _continue() {
    final errors = _validate();
    if (errors.isNotEmpty) {
      setState(() => _showErrors = true);
      final first = _F.values.firstWhere(errors.containsKey);
      final ctx = _keys[first]!.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(
          ctx,
          duration: const Duration(milliseconds: 250),
          alignment: 0.1,
        );
      }
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        settings: const RouteSettings(name: WizardRoutes.review),
        builder: (_) => ReviewScreen(draft: _d),
      ),
    );
  }

  void _changed(VoidCallback update) {
    update();
    if (_showErrors) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final errors = _showErrors ? _validate() : const <_F, String>{};
    final services = context.services;
    final fallback = SavedPlaceSearch(_saved);
    final search = services.placeSearch ?? fallback;
    final saved = fallback.usable;

    Widget place({
      required _F field,
      String? label,
      required DraftPlace? value,
      required ValueChanged<DraftPlace> onPicked,
    }) {
      return PlaceAutocompleteField(
        key: ValueKey('${_d.category}-$field'),
        service: search,
        label: label,
        hint: 'Search for a place',
        initialValue: value?.addressText,
        errorText: errors[field],
        savedAddresses: saved,
        onPlaceSelected: (p) => onPicked(
          DraftPlace(
            addressText: p.addressText,
            lat: p.lat,
            lng: p.lng,
            placeId: SavedPlaceSearch.isSavedId(p.placeId) ? null : p.placeId,
          ),
        ),
        onSavedAddressSelected: (a) => onPicked(
          DraftPlace(addressText: a.addressText, lat: a.lat!, lng: a.lon!),
        ),
      );
    }

    final firstLabel = switch (_d.category) {
      ErrandCategory.getItForMe => 'Pick up from',
      ErrandCategory.buyForMe => 'Buy from',
      _ => null,
    };

    return PushedScaffold(
      title: 'Task details',
      step: 2,
      // Not lazy: every card must exist so Continue can scroll to an error.
      body: SingleChildScrollView(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const StepProgressBar(total: 3, completed: 2),
            _Card(
              key: _keys[_F.title],
              label: 'Task title (optional)',
              child: NitumeField(
                controller: _title,
                hint: 'e.g. Apartment check — Nyali',
                errorText: errors[_F.title],
                onChanged: (v) => _changed(() => _d.title = v),
              ),
            ),
            _Card(
              key: _keys[_F.description],
              label: 'Describe the task',
              child: NitumeField.multiline(
                controller: _description,
                hint:
                    'e.g. Check the apartment in Nyali — video the compound, '
                    'both bedrooms and bathroom.',
                maxLines: 6,
                errorText: errors[_F.description],
                onChanged: (v) => _changed(() => _d.description = v),
              ),
            ),
            if (firstLabel == null)
              _Card(
                key: _keys[_F.first],
                label: 'Location',
                child: place(
                  field: _F.first,
                  value: _d.first,
                  onPicked: (p) => _changed(() => _d.first = p),
                ),
              )
            else
              Padding(
                key: _keys[_F.first],
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                child: NitumeCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      place(
                        field: _F.first,
                        label: firstLabel,
                        value: _d.first,
                        onPicked: (p) => _changed(() => _d.first = p),
                      ),
                      const SizedBox(height: 12),
                      KeyedSubtree(
                        key: _keys[_F.dropoff],
                        child: place(
                          field: _F.dropoff,
                          label: 'Deliver to',
                          value: _d.dropoff,
                          onPicked: (p) => _changed(() => _d.dropoff = p),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (services.placeSearch == null)
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 0, 20, 14),
                // Pending row 30 (Places client): only saved addresses with a
                // map location can be used (copy proposed).
                child: NitumeNotice(
                  message:
                      "Place search isn't available yet. Choose one of "
                      'your saved addresses that has a map location.',
                ),
              ),
            if (_d.isBuy)
              _Card(
                key: _keys[_F.items],
                label: 'Shopping list',
                child: ShoppingListEditor(
                  initialItems: _d.items,
                  errorText: errors[_F.items],
                  onChanged: (items) => _changed(() => _d.items = items),
                ),
              ),
            _Card(
              label: 'Deadline',
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final c in DeadlineChoice.values)
                    NitumeChoiceChip(
                      label: c.label,
                      selected: _d.deadline == c,
                      onSelected: () => setState(() => _d.deadline = c),
                    ),
                ],
              ),
            ),
            _Card(
              key: _keys[_F.budget],
              label: 'Budget (if a purchase is involved)',
              child: NitumeField.money(
                controller: _budget,
                hint: '0',
                errorText: errors[_F.budget],
                onChanged: (v) => _changed(() => _d.budget = int.tryParse(v)),
              ),
            ),
          ],
        ),
      ),
      cta: FixedCta(
        child: NitumeButton.primary(
          label: 'Continue →',
          expand: true,
          onPressed: _continue,
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({super.key, required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
      child: NitumeFormCard(label: label, child: child),
    );
  }
}
