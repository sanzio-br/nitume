import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

import '../../services/app_services.dart';
import '../auth/auth_frame.dart';

/// `x-location-disclosure` copy (`docs/specs/runner/x-location-disclosure.md`;
/// Body 2 approved by the owner, row 246).
abstract final class LocationDisclosureCopy {
  static const heading = 'Share your location while you work';
  static const body1 =
      "Nitume uses your location to show you nearby jobs, to tell the "
      "customer when you're on the way and when you've arrived.";
  static const body2 = RunnerLocationCopy.disclosureBody2;
  static const body3 =
      "We never share your location when you're offline, and customers only "
      "see it while you're working on their task.";
  static const cont = 'Continue';
  static const notNow = 'Not now';
}

/// `x-location-disclosure`: the prominent disclosure shown before the
/// first OS location prompt (system design §7.2, row 123). `Continue`
/// asks for when-in-use access and pops with the result; `Not now` (or
/// back) pops with `null`. While-in-use only (row 245): there is no
/// background or "Always" step later.
class LocationDisclosureScreen extends StatefulWidget {
  const LocationDisclosureScreen({super.key});

  @override
  State<LocationDisclosureScreen> createState() =>
      _LocationDisclosureScreenState();
}

class _LocationDisclosureScreenState extends State<LocationDisclosureScreen> {
  bool _asking = false;

  Future<void> _continue() async {
    setState(() => _asking = true);
    LocationAccess result;
    try {
      result = await AppScope.read(context).location.requestAccess();
    } on Object {
      result = LocationAccess.denied;
    }
    if (mounted) Navigator.of(context).pop(result);
  }

  @override
  Widget build(BuildContext context) {
    final body = NitumeTextStyles.muted.copyWith(fontSize: 13.5);
    return AuthFrame(
      header: const NitumePushedHeader(),
      children: [
        Center(
          child: Container(
            width: 56,
            height: 56,
            decoration: const BoxDecoration(
              color: NitumeColors.blue050,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.location_on_outlined,
              color: NitumeColors.blue,
              size: 28,
            ),
          ),
        ),
        const SizedBox(height: 18),
        AuthHeading(
          title: LocationDisclosureCopy.heading,
          sub: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(LocationDisclosureCopy.body1, style: body),
              const SizedBox(height: 10),
              Text(LocationDisclosureCopy.body2, style: body),
              const SizedBox(height: 10),
              Text(LocationDisclosureCopy.body3, style: body),
            ],
          ),
        ),
        NitumeButton.primary(
          label: LocationDisclosureCopy.cont,
          expand: true,
          loading: _asking,
          onPressed: _continue,
        ),
        const SizedBox(height: 8),
        Center(
          child: NitumeButton.text(
            label: LocationDisclosureCopy.notNow,
            onPressed: _asking ? null : () => Navigator.of(context).pop(),
          ),
        ),
      ],
    );
  }
}
