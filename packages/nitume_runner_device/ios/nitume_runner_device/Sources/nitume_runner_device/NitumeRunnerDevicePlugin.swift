import Flutter
import Foundation

/// Method channel `nitume_runner_device/backup` (owner row 255):
/// * `excludeFromBackup` `{ path }` → `true` once the folder is excluded;
/// * `isExcludedFromBackup` `{ path }` → the current value.
/// Errors come back as `FlutterError` codes `bad_args` / `backup_exclusion_failed`.
public class NitumeRunnerDevicePlugin: NSObject, FlutterPlugin {
  public static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "nitume_runner_device/backup",
      binaryMessenger: registrar.messenger())
    registrar.addMethodCallDelegate(NitumeRunnerDevicePlugin(), channel: channel)
  }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == "excludeFromBackup" || call.method == "isExcludedFromBackup" else {
      result(FlutterMethodNotImplemented)
      return
    }
    guard let args = call.arguments as? [String: Any],
      let path = args["path"] as? String, !path.isEmpty
    else {
      result(FlutterError(code: "bad_args", message: "path is required", details: nil))
      return
    }
    do {
      if call.method == "excludeFromBackup" {
        result(try BackupExclusion.exclude(path: path))
      } else {
        result(try BackupExclusion.isExcluded(path: path))
      }
    } catch {
      result(
        FlutterError(
          code: "backup_exclusion_failed", message: error.localizedDescription, details: nil))
    }
  }
}
