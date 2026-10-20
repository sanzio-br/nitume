// swift-tools-version: 5.9
// iOS side of nitume_runner_device: excludes the offline evidence folder from
// device backups (owner row 255). Apple frameworks only.

import PackageDescription

let package = Package(
    name: "nitume_runner_device",
    platforms: [
        .iOS("15.0")
    ],
    products: [
        .library(name: "nitume-runner-device", targets: ["nitume_runner_device"])
    ],
    dependencies: [
        .package(name: "FlutterFramework", path: "../FlutterFramework")
    ],
    targets: [
        .target(
            name: "nitume_runner_device",
            dependencies: [
                .product(name: "FlutterFramework", package: "FlutterFramework")
            ]
        )
    ]
)
