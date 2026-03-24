import Cocoa
import Foundation

/// JSON-RPC 2.0 request
struct JsonRpcRequest: Codable {
    let jsonrpc: String
    let id: String?
    let method: String
    let params: [String: AnyCodable]?
}

/// JSON-RPC 2.0 response
struct JsonRpcResponse: Encodable {
    let jsonrpc: String = "2.0"
    let id: String?
    let result: AnyCodable?
    let error: JsonRpcError?
}

struct JsonRpcError: Codable {
    let code: Int
    let message: String
}

/// Simple Any-encodable wrapper
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) {
            value = str
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else if let arr = try? container.decode([AnyCodable].self) {
            value = arr.map { $0.value }
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let str as String: try container.encode(str)
        case let int as Int: try container.encode(int)
        case let int32 as Int32: try container.encode(Int(int32))
        case let double as Double: try container.encode(double)
        case let bool as Bool: try container.encode(bool)
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        case let arr as [Any]:
            try container.encode(arr.map { AnyCodable($0) })
        case is NSNull: try container.encodeNil()
        case let encodable as Encodable:
            try encodable.encode(to: encoder)
        default: try container.encodeNil()
        }
    }
}

/// NDJSON-based JSON-RPC server reading from stdin/stdout
public final class JsonRpcServer {
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var running = true
    private let recorder = MeetingRecorder()
    private var modifierTapMonitor: ModifierTapMonitor?

    public init() {
        encoder.outputFormatting = []
    }

    public func run() {
        // Send ready notification
        send(JsonRpcResponse(
            id: nil,
            result: AnyCodable(["status": "ready", "version": "1.0.0"]),
            error: nil
        ))

        // Read stdin line by line
        while running, let line = readLine(strippingNewline: true) {
            guard !line.isEmpty else { continue }
            handleLine(line)
        }
    }

    private func handleLine(_ line: String) {
        guard let data = line.data(using: .utf8),
              let request = try? decoder.decode(JsonRpcRequest.self, from: data) else {
            send(JsonRpcResponse(
                id: nil, result: nil,
                error: JsonRpcError(code: -32700, message: "Parse error")
            ))
            return
        }

        // Handle async methods (dispatched to main RunLoop for AX API safety)
        switch request.method {
        case "audio.startRecording":
            let preferTap = (request.params?["preferCoreAudioTap"]?.value as? Bool) ?? true
            handleStartRecording(id: request.id, preferCoreAudioTap: preferTap)
            return
        case "getContext":
            dispatchToMain { [self] in
                let resp = handleGetContext(id: request.id)
                send(resp)
            }
            return
        case "getContextTree":
            dispatchToMain { [self] in
                let resp = handleGetContextTree(id: request.id)
                send(resp)
            }
            return
        case "getFrontmostApp":
            dispatchToMain { [self] in
                let resp = handleGetFrontmostApp(id: request.id)
                send(resp)
            }
            return
        case "checkPermissions":
            dispatchToMain { [self] in
                let resp = handleCheckPermissions(id: request.id)
                send(resp)
            }
            return
        case "configureModifierTapMonitor":
            dispatchToMain { [self] in
                let resp = handleConfigureModifierTapMonitor(id: request.id, params: request.params)
                send(resp)
            }
            return
        case "stopModifierTapMonitor":
            dispatchToMain { [self] in
                let resp = handleStopModifierTapMonitor(id: request.id)
                send(resp)
            }
            return
        default:
            break
        }

        // Handle sync methods (no AX calls, safe on any thread)
        let response: JsonRpcResponse
        switch request.method {
        case "detectMeetingByMic":
            response = handleDetectMeetingByMic(id: request.id)
        case "audio.getCapabilities":
            response = handleGetCapabilities(id: request.id)
        case "audio.stopRecording":
            response = handleStopRecording(id: request.id)
        case "audio.getStatus":
            response = handleGetAudioStatus(id: request.id)
        case "shutdown":
            let _ = recorder.stop()
            running = false
            response = JsonRpcResponse(id: request.id, result: AnyCodable(["ok": true]), error: nil)
        default:
            response = JsonRpcResponse(
                id: request.id, result: nil,
                error: JsonRpcError(code: -32601, message: "Method not found: \(request.method)")
            )
        }
        send(response)
    }

    // MARK: - Main thread dispatch

    /// Dispatch a block to the main CFRunLoop. Unlike DispatchQueue.main.async,
    /// CFRunLoopPerformBlock works with RunLoop.main.run() / Timer-based RunLoops.
    private func dispatchToMain(_ block: @escaping () -> Void) {
        CFRunLoopPerformBlock(CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue as CFString, block)
        CFRunLoopWakeUp(CFRunLoopGetMain())
    }

    // MARK: - Context handlers

    private func handleGetContext(id: String?) -> JsonRpcResponse {
        if let context = AXTreeWalker.getContext() {
            return JsonRpcResponse(id: id, result: AnyCodable(context), error: nil)
        }
        return JsonRpcResponse(
            id: id, result: nil,
            error: JsonRpcError(code: -1, message: "Could not get context")
        )
    }

    private func handleGetContextTree(id: String?) -> JsonRpcResponse {
        guard let result = AXTreeWalker.getContextWithTree() else {
            return JsonRpcResponse(
                id: id, result: nil,
                error: JsonRpcError(code: -1, message: "Could not get context")
            )
        }
        var dict: [String: Any] = [
            "appName": result.context.appName,
            "bundleId": result.context.bundleId,
        ]
        if let wt = result.context.windowTitle { dict["windowTitle"] = wt }
        if let url = result.context.url { dict["url"] = url }
        if let pt = result.context.pageTitle { dict["pageTitle"] = pt }
        if let vt = result.context.visibleText { dict["visibleText"] = vt }
        if let tree = result.tree { dict["axTree"] = tree.toDict() }
        return JsonRpcResponse(id: id, result: AnyCodable(dict), error: nil)
    }

    private func handleGetFrontmostApp(id: String?) -> JsonRpcResponse {
        if let app = AXHelpers.getFrontmostApp() {
            return JsonRpcResponse(id: id, result: AnyCodable(app), error: nil)
        }
        return JsonRpcResponse(
            id: id, result: nil,
            error: JsonRpcError(code: -1, message: "No frontmost app")
        )
    }

    private func handleCheckPermissions(id: String?) -> JsonRpcResponse {
        let state = PermissionChecker.check()
        return JsonRpcResponse(id: id, result: AnyCodable(state), error: nil)
    }

    // MARK: - Meeting detection by mic activity

    private func handleDetectMeetingByMic(id: String?) -> JsonRpcResponse {
        let result = MicActivityDetector.detect()
        return JsonRpcResponse(id: id, result: AnyCodable(result), error: nil)
    }

    // MARK: - Audio recording handlers

    private func handleGetCapabilities(id: String?) -> JsonRpcResponse {
        let caps = MeetingRecorder.getCapabilities()
        return JsonRpcResponse(id: id, result: AnyCodable(caps), error: nil)
    }

    private func handleStartRecording(id: String?, preferCoreAudioTap: Bool) {
        Task {
            do {
                let info = try await recorder.start(preferCoreAudioTap: preferCoreAudioTap)
                let result: [String: Any] = [
                    "status": info.status,
                    "systemAudioPath": info.systemAudioPath,
                    "micAudioPath": info.micAudioPath,
                    "combinedAudioPath": info.combinedAudioPath,
                    "captureMethod": info.captureMethod,
                    "aecEnabled": info.aecEnabled
                ]
                send(JsonRpcResponse(id: id, result: AnyCodable(result), error: nil))
            } catch {
                send(JsonRpcResponse(
                    id: id, result: nil,
                    error: JsonRpcError(code: -2, message: "Start recording failed: \(error)")
                ))
            }
        }
    }

    private func handleStopRecording(id: String?) -> JsonRpcResponse {
        let result = recorder.stop()
        let dict: [String: Any] = [
            "systemAudioPath": result.systemAudioPath ?? "",
            "micAudioPath": result.micAudioPath ?? "",
            "combinedAudioPath": result.combinedAudioPath ?? "",
            "durationSeconds": result.durationSeconds,
            "captureMethod": result.captureMethod,
            "aecEnabled": result.aecEnabled
        ]
        return JsonRpcResponse(id: id, result: AnyCodable(dict), error: nil)
    }

    private func handleGetAudioStatus(id: String?) -> JsonRpcResponse {
        let s = recorder.status
        let dict: [String: Any] = [
            "recording": s.recording,
            "durationSeconds": s.durationSeconds,
            "captureMethod": s.captureMethod,
            "aecEnabled": s.aecEnabled,
            "systemBufferCount": s.systemBufferCount,
            "micBufferCount": s.micBufferCount
        ]
        return JsonRpcResponse(id: id, result: AnyCodable(dict), error: nil)
    }

    // MARK: - Modifier tap monitor handlers

    private func handleConfigureModifierTapMonitor(id: String?, params: [String: AnyCodable]?) -> JsonRpcResponse {
        // Stop any existing monitor first
        modifierTapMonitor?.stop()

        // Parse optional params with defaults
        let requiredTaps = (params?["requiredTaps"]?.value as? Int) ?? 2
        let tapInterval = (params?["tapInterval"]?.value as? Double) ?? 0.4
        let maxHoldDuration = (params?["maxHoldDuration"]?.value as? Double) ?? 0.3

        // Parse modifier flag (default: option)
        let modifier: NSEvent.ModifierFlags
        if let modifierName = params?["modifier"]?.value as? String {
            switch modifierName.lowercased() {
            case "option", "alt":
                modifier = .option
            case "control", "ctrl":
                modifier = .control
            case "command", "cmd":
                modifier = .command
            case "shift":
                modifier = .shift
            default:
                modifier = .option
            }
        } else {
            modifier = .option
        }

        let monitor = ModifierTapMonitor(
            modifier: modifier,
            requiredTaps: requiredTaps,
            tapInterval: tapInterval,
            maxHoldDuration: maxHoldDuration
        ) { [weak self] event in
            guard let self = self else { return }
            let eventType: String
            switch event {
            case .tap:
                eventType = "modifierTap"
            case .holdStarted:
                eventType = "modifierHoldStarted"
            case .holdReleased:
                eventType = "modifierHoldReleased"
            }
            // Send a JSON-RPC notification (id: null)
            self.send(JsonRpcResponse(
                id: nil,
                result: AnyCodable(["type": eventType]),
                error: nil
            ))
        }

        monitor.start()
        modifierTapMonitor = monitor

        return JsonRpcResponse(
            id: id,
            result: AnyCodable(["ok": true, "requiredTaps": requiredTaps, "tapInterval": tapInterval, "maxHoldDuration": maxHoldDuration]),
            error: nil
        )
    }

    private func handleStopModifierTapMonitor(id: String?) -> JsonRpcResponse {
        modifierTapMonitor?.stop()
        modifierTapMonitor = nil
        return JsonRpcResponse(id: id, result: AnyCodable(["ok": true]), error: nil)
    }

    private func send(_ response: JsonRpcResponse) {
        guard let data = try? encoder.encode(response),
              let json = String(data: data, encoding: .utf8) else { return }
        print(json)
        fflush(stdout)
    }
}
