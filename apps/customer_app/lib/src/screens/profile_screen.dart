import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Profile screen — address & payment-method editing pending.',
            textAlign: TextAlign.center,
            style: TextStyle(color: NitumeColors.slate600),
          ),
        ),
      ),
    );
  }
}