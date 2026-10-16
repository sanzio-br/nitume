import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// Root tab frame until its spec is built: the C-09 top bar with the tab
/// title over an empty slate body.
class RootTabPlaceholder extends StatelessWidget {
  const RootTabPlaceholder({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: ListView(children: [NitumeTopBar(title: title)]),
    );
  }
}
