import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Keeps a folder out of device backups (owner row 255).
///
/// * iOS: sets `NSURLIsExcludedFromBackupKey` on the folder through this
///   package's native side (method channel `nitume_runner_device/backup`);
///   that covers the folder and everything in it.
/// * Android: nothing to do at run time. The runner app's manifest backup
///   rules (`android:fullBackupContent` and `android:dataExtractionRules`)
///   exclude `nitume_evidence` in the `file` domain.
/// * Other platforms: nothing.
abstract final class BackupExclusion {
  static const channel = MethodChannel('nitume_runner_device/backup');

  /// Excludes [folder] from backups. Throws [FileSystemException] when the
  /// iOS side could not set the key (callers decide whether to retry; the
  /// evidence store retries on its next use and never blocks a capture).
  static Future<void> exclude(
    Directory folder, {
    @visibleForTesting TargetPlatform? platform,
  }) async {
    if ((platform ?? defaultTargetPlatform) != TargetPlatform.iOS) return;
    final bool? done;
    try {
      done = await channel.invokeMethod<bool>('excludeFromBackup', {
        'path': folder.path,
      });
    } on PlatformException catch (e) {
      throw FileSystemException(
        'Could not exclude from backup: ${e.code}',
        folder.path,
      );
    }
    if (done != true) {
      throw FileSystemException('Not excluded from backup', folder.path);
    }
  }

  /// iOS: whether [folder] is excluded. Elsewhere `null` (Android relies on
  /// the manifest rules, which cannot be read at run time).
  static Future<bool?> isExcluded(
    Directory folder, {
    @visibleForTesting TargetPlatform? platform,
  }) async {
    if ((platform ?? defaultTargetPlatform) != TargetPlatform.iOS) return null;
    return channel.invokeMethod<bool>('isExcludedFromBackup', {
      'path': folder.path,
    });
  }
}
