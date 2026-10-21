import java.util.Base64

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Firebase (FCM, row 31): google-services.json is never committed (see the
// app README). Without it the plugin is skipped and the app runs with push
// disabled (core FcmPushService falls back to a no-op).
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

/**
 * Google Maps SDK key (row 30) from, in order: the Gradle property or
 * environment variable MAPS_API_KEY, or `--dart-define=NITUME_MAPS_API_KEY`.
 * Empty when none is set: the app then keeps the map placeholder
 * (`NITUME_MAPS_ENABLED` stays false). Never commit a real key.
 */
fun mapsApiKey(): String {
    (project.findProperty("MAPS_API_KEY") as String?)?.let { return it }
    System.getenv("MAPS_API_KEY")?.let { return it }
    val defines = project.findProperty("dart-defines") as String? ?: return ""
    return defines.split(",")
        .map { String(Base64.getDecoder().decode(it)) }
        .firstOrNull { it.startsWith("NITUME_MAPS_API_KEY=") }
        ?.substringAfter("=") ?: ""
}

android {
    namespace = "com.nitume.runner_app"
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.nitume.runner_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["mapsApiKey"] = mapsApiKey()
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
