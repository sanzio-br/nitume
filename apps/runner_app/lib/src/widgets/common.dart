import 'package:flutter/material.dart';

/// Shows a snackbar through the nearest messenger.
void showSnack(BuildContext context, String message) {
  ScaffoldMessenger.maybeOf(context)
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
