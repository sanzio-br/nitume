import 'dart:async';

import 'package:flutter/material.dart';

import '../models/customer_profile.dart';
import '../places/place_search.dart';
import '../theme/nitume_colors.dart';
import '../theme/nitume_typography.dart';
import 'nitume_field.dart';

/// Location field for the task wizard (`v-new-details`): a [NitumeField] with
/// a pin icon that searches [service] (debounced 300ms, one session token per
/// search session) and lists results under the field. While the query is
/// empty it offers [savedAddresses] (shortcut placement is v-new-details Q3).
class PlaceAutocompleteField extends StatefulWidget {
  const PlaceAutocompleteField({
    super.key,
    required this.service,
    required this.onPlaceSelected,
    this.onSavedAddressSelected,
    this.savedAddresses = const [],
    this.label,
    this.hint,
    this.initialValue,
    this.errorText,
    this.debounce = const Duration(milliseconds: 300),
  });

  final PlaceSearchService service;
  final ValueChanged<PlaceDetails> onPlaceSelected;
  final ValueChanged<SavedAddress>? onSavedAddressSelected;
  final List<SavedAddress> savedAddresses;
  final String? label;
  final String? hint;

  /// Address shown in the field as a value (not a hint), e.g. the place the
  /// customer already chose. When it changes and the field is not focused,
  /// the field text is replaced with it.
  final String? initialValue;
  final String? errorText;
  final Duration debounce;

  @override
  State<PlaceAutocompleteField> createState() => _PlaceAutocompleteFieldState();
}

class _PlaceAutocompleteFieldState extends State<PlaceAutocompleteField> {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  Timer? _timer;
  String _session = newPlacesSessionToken();
  List<PlaceSuggestion> _results = const [];
  bool _loading = false;
  int _requestId = 0;

  @override
  void initState() {
    super.initState();
    _controller.text = widget.initialValue ?? '';
    _focus.addListener(() => setState(() {}));
  }

  @override
  void didUpdateWidget(PlaceAutocompleteField oldWidget) {
    super.didUpdateWidget(oldWidget);
    final value = widget.initialValue;
    if (value != oldWidget.initialValue &&
        value != null &&
        !_focus.hasFocus &&
        value != _controller.text) {
      _controller.text = value;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _timer?.cancel();
    if (value.trim().length < 2) {
      setState(() {
        _results = const [];
        _loading = false;
      });
      return;
    }
    _timer = Timer(widget.debounce, () => _search(value.trim()));
  }

  Future<void> _search(String query) async {
    final id = ++_requestId;
    setState(() => _loading = true);
    try {
      final results =
          await widget.service.autocomplete(query, sessionToken: _session);
      if (!mounted || id != _requestId) return;
      setState(() => _results = results);
    } catch (_) {
      if (!mounted || id != _requestId) return;
      setState(() => _results = const []);
    } finally {
      if (mounted && id == _requestId) setState(() => _loading = false);
    }
  }

  Future<void> _pick(PlaceSuggestion s) async {
    final details =
        await widget.service.details(s.placeId, sessionToken: _session);
    if (!mounted) return;
    _session = newPlacesSessionToken();
    _controller.text = details.addressText;
    setState(() => _results = const []);
    _focus.unfocus();
    widget.onPlaceSelected(details);
  }

  void _pickSaved(SavedAddress a) {
    _controller.text = a.addressText;
    _focus.unfocus();
    widget.onSavedAddressSelected?.call(a);
  }

  @override
  Widget build(BuildContext context) {
    final showSaved = _focus.hasFocus &&
        _controller.text.isEmpty &&
        widget.savedAddresses.isNotEmpty &&
        widget.onSavedAddressSelected != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        NitumeField(
          label: widget.label,
          hint: widget.hint,
          controller: _controller,
          focusNode: _focus,
          errorText: widget.errorText,
          textInputAction: TextInputAction.search,
          prefixIcon: const Icon(Icons.place_outlined, size: 18),
          suffixIcon: _loading
              ? const Padding(
                  padding: EdgeInsets.all(14),
                  child: SizedBox.square(
                    dimension: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : null,
          onChanged: _onChanged,
        ),
        if (showSaved)
          for (final a in widget.savedAddresses)
            _ResultTile(
              icon: Icons.bookmark_border_rounded,
              title: a.label,
              subtitle: a.addressText,
              onTap: () => _pickSaved(a),
            ),
        for (final s in _results)
          _ResultTile(
            icon: Icons.place_outlined,
            title: s.primaryText,
            subtitle: s.secondaryText,
            onTap: () => _pick(s),
          ),
      ],
    );
  }
}

class _ResultTile extends StatelessWidget {
  const _ResultTile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: NitumeColors.slateLine)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: NitumeColors.slate400),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(title, style: NitumeTextStyles.rowTitle),
                  if (subtitle != null)
                    Text(subtitle!, style: NitumeTextStyles.mutedSmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
