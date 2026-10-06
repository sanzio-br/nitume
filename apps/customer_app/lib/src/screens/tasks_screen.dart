import 'package:flutter/material.dart';
import 'package:nitume_core/nitume_core.dart';

class TasksScreen extends StatelessWidget {
  const TasksScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Tasks screen — task list pending.',
            textAlign: TextAlign.center,
            style: TextStyle(color: NitumeColors.slate600),
          ),
        ),
      ),
    );
  }
}