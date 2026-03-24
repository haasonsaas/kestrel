import Foundation
import ContextKitLib

func log(_ message: String) {
    FileHandle.standardError.write(Data("[contextkit] \(message)\n".utf8))
}

let hasAccess = AXHelpers.checkAccessibility(prompt: false)
if !hasAccess {
    log("WARNING: Accessibility permission not granted.")
}

let server = JsonRpcServer()

// Run JSON-RPC stdin reader on background thread
DispatchQueue.global(qos: .userInitiated).async {
    server.run()
    exit(0)
}

// Keep the main RunLoop alive with a dummy timer.
// AudioQueue and ScreenCaptureKit callbacks are delivered on the
// main CFRunLoop. Without an input source, RunLoop.main.run() returns
// immediately. This timer keeps it spinning forever.
Timer.scheduledTimer(withTimeInterval: 3600, repeats: true) { _ in }
RunLoop.main.run()
