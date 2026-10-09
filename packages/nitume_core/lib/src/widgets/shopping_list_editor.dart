import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/nitume_colors.dart';
import '../theme/nitume_design_choices.dart';
import '../theme/nitume_typography.dart';
import 'nitume_button.dart';
import 'nitume_field.dart';

/// One shopping-list line (`CreateErrandDto.items[]`: `name`, `quantity`).
@immutable
class ShoppingListItem {
  const ShoppingListItem({this.name = '', this.quantity = 1});

  final String name;
  final int quantity;

  @override
  bool operator ==(Object other) =>
      other is ShoppingListItem &&
      other.name == name &&
      other.quantity == quantity;

  @override
  int get hashCode => Object.hash(name, quantity);

  @override
  String toString() => 'ShoppingListItem($name × $quantity)';
}

/// C-37. Shopping-list editor (Buy For Me, `v-new-details`): item rows, each
/// with a name field (max [maxNameLength]), a Fira Code 13/600 quantity
/// stepper (− / n / +, [minQuantity]..[maxQuantity], 32px buttons with 48dp
/// hit areas) and a slate-400 × remove button (hidden when only one row).
/// Rows are separated by slate-line hairlines; a green-700 `+ Add item` link
/// follows (hidden at [maxItems]). [errorText] shows a red inline error
/// under the list (e.g. `Add at least one item.`).
///
/// Uncontrolled: seed it with [initialItems]; every edit reports the full
/// list (including rows whose name is still empty) through [onChanged]. The
/// screen trims and validates.
class ShoppingListEditor extends StatefulWidget {
  const ShoppingListEditor({
    super.key,
    required this.onChanged,
    this.initialItems = const [],
    this.errorText,
    this.hint = 'Item, e.g. 2kg sugar',
    this.addLabel = '+ Add item',
  });

  final ValueChanged<List<ShoppingListItem>> onChanged;
  final List<ShoppingListItem> initialItems;
  final String? errorText;
  final String hint;
  final String addLabel;

  static const int maxItems = 30;
  static const int minQuantity = 1;
  static const int maxQuantity = 99;
  static const int maxNameLength = 80;

  @override
  State<ShoppingListEditor> createState() => _ShoppingListEditorState();
}

class _Line {
  _Line(String name, this.quantity, this.id)
      : controller = TextEditingController(text: name);

  final TextEditingController controller;
  int quantity;
  final int id;
}

class _ShoppingListEditorState extends State<ShoppingListEditor> {
  final List<_Line> _lines = [];
  int _nextId = 0;

  @override
  void initState() {
    super.initState();
    final seed = widget.initialItems.isEmpty
        ? const [ShoppingListItem()]
        : widget.initialItems.take(ShoppingListEditor.maxItems);
    for (final item in seed) {
      _lines.add(_Line(item.name, _clamp(item.quantity), _nextId++));
    }
  }

  @override
  void dispose() {
    for (final line in _lines) {
      line.controller.dispose();
    }
    super.dispose();
  }

  static int _clamp(int q) => q
      .clamp(ShoppingListEditor.minQuantity, ShoppingListEditor.maxQuantity)
      .toInt();

  void _emit() {
    widget.onChanged([
      for (final l in _lines)
        ShoppingListItem(name: l.controller.text, quantity: l.quantity),
    ]);
  }

  void _add() {
    setState(() => _lines.add(_Line('', 1, _nextId++)));
    _emit();
  }

  void _remove(_Line line) {
    setState(() => _lines.remove(line));
    // Dispose after the row has left the tree.
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => line.controller.dispose(),
    );
    _emit();
  }

  void _setQuantity(_Line line, int q) {
    setState(() => line.quantity = _clamp(q));
    _emit();
  }

  @override
  Widget build(BuildContext context) {
    final canRemove = _lines.length > 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < _lines.length; i++)
          Container(
            key: ValueKey('shopping-line-${_lines[i].id}'),
            padding: const EdgeInsets.symmetric(vertical: 6),
            decoration: i == 0
                ? null
                : const BoxDecoration(
                    border: Border(
                      top: BorderSide(color: NitumeColors.slateLine),
                    ),
                  ),
            child: Row(
              children: [
                Expanded(
                  child: NitumeField(
                    controller: _lines[i].controller,
                    hint: widget.hint,
                    textInputAction: TextInputAction.next,
                    inputFormatters: [
                      LengthLimitingTextInputFormatter(
                        ShoppingListEditor.maxNameLength,
                      ),
                    ],
                    onChanged: (_) => _emit(),
                  ),
                ),
                const SizedBox(width: 4),
                _QuantityStepper(
                  value: _lines[i].quantity,
                  onChanged: (q) => _setQuantity(_lines[i], q),
                ),
                if (canRemove)
                  IconButton(
                    tooltip: 'Remove item',
                    constraints: const BoxConstraints(
                      minWidth: NitumeSpacing.minTapTarget,
                      minHeight: NitumeSpacing.minTapTarget,
                    ),
                    icon: const Icon(
                      Icons.close_rounded,
                      size: 18,
                      color: NitumeColors.slate400,
                    ),
                    onPressed: () => _remove(_lines[i]),
                  ),
              ],
            ),
          ),
        if (_lines.length < ShoppingListEditor.maxItems)
          Align(
            alignment: Alignment.centerLeft,
            child: NitumeButton.link(label: widget.addLabel, onPressed: _add),
          ),
        if (widget.errorText != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              widget.errorText!,
              style: NitumeTextStyles.body.copyWith(
                fontSize: 12.5,
                color: NitumeDesignChoices.fieldError,
              ),
            ),
          ),
      ],
    );
  }
}

class _QuantityStepper extends StatelessWidget {
  const _QuantityStepper({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final canDecrease = value > ShoppingListEditor.minQuantity;
    final canIncrease = value < ShoppingListEditor.maxQuantity;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _StepButton(
          icon: Icons.remove_rounded,
          tooltip: 'Decrease quantity',
          onPressed: canDecrease ? () => onChanged(value - 1) : null,
        ),
        Semantics(
          label: 'Quantity $value',
          excludeSemantics: true,
          child: SizedBox(
            width: 24,
            child: Text(
              '$value',
              textAlign: TextAlign.center,
              style: NitumeTypography.numeric(
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
        _StepButton(
          icon: Icons.add_rounded,
          tooltip: 'Increase quantity',
          onPressed: canIncrease ? () => onChanged(value + 1) : null,
        ),
      ],
    );
  }
}

/// 32px slate-line circle with a blue glyph inside a 48dp hit area.
class _StepButton extends StatelessWidget {
  const _StepButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return Tooltip(
      message: tooltip,
      excludeFromSemantics: true,
      child: Semantics(
        button: true,
        enabled: enabled,
        label: tooltip,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onPressed,
          child: SizedBox.square(
            dimension: NitumeSpacing.minTapTarget,
            child: Center(
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: NitumeColors.white,
                  shape: BoxShape.circle,
                  border: Border.all(color: NitumeColors.slateLine),
                ),
                child: Icon(
                  icon,
                  size: 16,
                  color: enabled ? NitumeColors.blue : NitumeColors.slate400,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
