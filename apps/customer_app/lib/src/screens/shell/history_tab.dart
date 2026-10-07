import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

/// Root tab. Built in a later commit.
class HistoryTab extends StatelessWidget {
  const HistoryTab({super.key, required this.active});

  final bool active;

  @override
  Widget build(BuildContext context) {
    return SafeArea(child: NitumeTopBar(title: 'History'));
  }
}
