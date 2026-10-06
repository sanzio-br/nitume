import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Notification feed pending — backend events wire up in next phase.',
            textAlign: TextAlign.center,
            style: TextStyle(color: NitumeColors.slate600),
          ),
        ),
      ),
    );
  }
}