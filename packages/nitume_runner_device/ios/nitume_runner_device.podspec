#
# iOS side of nitume_runner_device: excludes the offline evidence folder from
# device backups (NSURLIsExcludedFromBackupKey, owner row 255). Apple
# frameworks only; no third-party code.
#
Pod::Spec.new do |s|
  s.name             = 'nitume_runner_device'
  s.version          = '0.0.1'
  s.summary          = 'Nitume Runner device helpers (backup exclusion).'
  s.description      = <<-DESC
Excludes the Nitume Runner offline evidence folder from iCloud and device backups.
                       DESC
  s.homepage         = 'https://nitume.invalid'
  s.license          = { :type => 'Proprietary', :text => 'Nitume internal package.' }
  s.author           = 'Nitume'
  s.source           = { :path => '.' }
  s.source_files = 'nitume_runner_device/Sources/nitume_runner_device/**/*.swift'
  s.dependency 'Flutter'
  s.platform = :ios, '15.0'

  # Flutter.framework does not contain a i386 slice.
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'i386' }
  s.swift_version = '5.0'
end
