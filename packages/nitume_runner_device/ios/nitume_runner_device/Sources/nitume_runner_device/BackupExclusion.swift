import Foundation

/// Sets and reads `NSURLIsExcludedFromBackupKey` (owner row 255). Set on a
/// folder, it keeps the folder and everything in it out of iCloud and
/// device backups.
enum BackupExclusion {
  /// Excludes `path` from backups and returns the value read back.
  static func exclude(path: String) throws -> Bool {
    var url = URL(fileURLWithPath: path, isDirectory: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
    return try isExcluded(path: path)
  }

  /// Whether `path` is excluded from backups.
  static func isExcluded(path: String) throws -> Bool {
    let url = URL(fileURLWithPath: path, isDirectory: true)
    let values = try url.resourceValues(forKeys: [.isExcludedFromBackupKey])
    return values.isExcludedFromBackup ?? false
  }
}
