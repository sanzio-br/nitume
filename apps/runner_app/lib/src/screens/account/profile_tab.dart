import 'package:flutter/material.dart';

import '../../widgets/root_tab_placeholder.dart';

/// `v-profile` root tab. Body pending its spec build
/// (`docs/specs/runner/v-profile.md`).
class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});

  @override
  Widget build(BuildContext context) =>
      const RootTabPlaceholder(title: 'Profile');
}
