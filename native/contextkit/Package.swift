// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ContextKit",
    platforms: [
        .macOS(.v14)  // Required for Core Audio Taps (macOS 14.2+)
    ],
    products: [
        .executable(name: "contextkit", targets: ["contextkit-cli"])
    ],
    targets: [
        .target(
            name: "ContextKitLib",
            path: "Sources/ContextKitLib",
            linkerSettings: [
                .linkedFramework("ApplicationServices"),
                .linkedFramework("AppKit"),
                .linkedFramework("CoreAudio"),
                .linkedFramework("AudioToolbox"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("ScreenCaptureKit")
            ]
        ),
        .executableTarget(
            name: "contextkit-cli",
            dependencies: ["ContextKitLib"],
            path: "Sources/contextkit-cli"
        )
    ]
)
