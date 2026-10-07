import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/app_services.dart';
import '../../services/saved_place_search.dart';
import '../../widgets/common.dart';

/// `x-address-form`: add or edit a saved place.
///
/// No Places client is approved (row 30), so the address is typed by hand
/// and saved without coordinates (`lat`/`lon` are optional on the API).
/// Such addresses cannot be used as errand locations until Places exists.
class AddressFormScreen extends StatefulWidget {
  const AddressFormScreen({super.key, this.address});

  /// `null` = add mode.
  final SavedAddress? address;

  @override
  State<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends State<AddressFormScreen> {
  static const _maxName = 40;
  late final AppServices _services = context.services;
  late final _name = TextEditingController(text: widget.address?.label);
  late final _address = TextEditingController(
    text: widget.address?.addressText,
  );
  late bool _default = widget.address?.isDefault ?? false;
  PlaceDetails? _place;
  String? _nameError;
  String? _addressError;
  bool _saving = false;

  bool get _edit => widget.address != null;
  bool get _wasDefault => widget.address?.isDefault ?? false;

  bool get _dirty =>
      _name.text != (widget.address?.label ?? '') ||
      _address.text != (widget.address?.addressText ?? '') ||
      _place != null ||
      _default != _wasDefault;

  @override
  void dispose() {
    _name.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    final text = (_place?.addressText ?? _address.text).trim();
    setState(() {
      _nameError = name.isEmpty ? 'Give this place a name.' : null;
      _addressError = text.isEmpty
          ? (_services.placeSearch == null
                ? 'Enter an address.'
                : 'Choose an address from the list.')
          : null;
    });
    if (_nameError != null || _addressError != null) return;
    setState(() => _saving = true);
    final account = _services.account;
    try {
      if (_edit) {
        final id = widget.address!.id;
        await account.updateAddress(
          id,
          label: name,
          addressText: text,
          lat: _place?.lat,
          lon: _place?.lng,
        );
        if (_default && !_wasDefault) await account.setDefaultAddress(id);
      } else {
        await account.addAddress(
          label: name,
          addressText: text,
          lat: _place?.lat,
          lon: _place?.lng,
          isDefault: _default,
        );
      }
      if (mounted) Navigator.of(context).pop('Saved.');
    } on Object {
      if (!mounted) return;
      setState(() => _saving = false);
      showSnack(context, "Couldn't save the address. Try again.");
    }
  }

  Future<void> _delete() async {
    final a = widget.address!;
    final ok = await showNitumeConfirmDialog(
      context,
      title: 'Delete "${a.label}"?',
      body: 'You can add it again later.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
    );
    if (!ok || !mounted) return;
    setState(() => _saving = true);
    try {
      await _services.account.removeAddress(a.id);
      if (mounted) Navigator.of(context).pop('Deleted.');
    } on Object {
      if (!mounted) return;
      setState(() => _saving = false);
      showSnack(context, "Couldn't save the address. Try again.");
    }
  }

  Future<void> _back() async {
    if (!_dirty) {
      Navigator.of(context).pop();
      return;
    }
    final discard = await showNitumeConfirmDialog(
      context,
      title: 'Discard your changes?',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    );
    if (discard && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final search = _services.placeSearch;
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: PushedScaffold(
        title: _edit ? 'Edit address' : 'Add address',
        onBack: _back,
        body: ListView(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
              child: NitumeCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    NitumeField(
                      label: 'Name',
                      hint: "e.g. Home, Office, Mum's place",
                      controller: _name,
                      errorText: _nameError,
                      onChanged: (_) =>
                          setState(() => clampText(_name, _maxName)),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final quick in const ['Home', 'Office'])
                          NitumeChoiceChip(
                            label: quick,
                            selected: _name.text.trim() == quick,
                            onSelected: () =>
                                setState(() => _name.text = quick),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (search != null)
                      PlaceAutocompleteField(
                        service: search,
                        label: 'Address',
                        hint: _address.text.isEmpty
                            ? 'Search for a place'
                            : _address.text,
                        errorText: _addressError,
                        onPlaceSelected: (p) => setState(
                          () => _place = SavedPlaceSearch.isSavedId(p.placeId)
                              ? null
                              : p,
                        ),
                      )
                    else
                      NitumeField(
                        label: 'Address',
                        hint: 'e.g. Kilimani Rd, Nairobi',
                        controller: _address,
                        errorText: _addressError,
                        onChanged: (_) => setState(() {}),
                      ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  NitumeCheckbox(
                    value: _default,
                    label: 'Set as default',
                    onChanged: _wasDefault
                        ? null
                        : (v) => setState(() => _default = v),
                  ),
                  if (_wasDefault)
                    Padding(
                      padding: const EdgeInsets.only(left: 32, top: 2),
                      child: Text(
                        'This is your default address.',
                        style: NitumeTextStyles.muted.copyWith(fontSize: 12),
                      ),
                    ),
                ],
              ),
            ),
            if (_edit)
              Center(
                child: NitumeButton.text(
                  label: 'Delete address',
                  destructive: true,
                  onPressed: _saving ? null : _delete,
                ),
              ),
          ],
        ),
        cta: FixedCta(
          child: NitumeButton.primary(
            label: 'Save address',
            expand: true,
            loading: _saving,
            onPressed: _save,
          ),
        ),
      ),
    );
  }
}
