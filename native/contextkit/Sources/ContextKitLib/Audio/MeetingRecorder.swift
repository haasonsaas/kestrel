import AVFoundation
import Foundation

/// Orchestrates high-fidelity meeting recording with three capture strategies:
///
/// 1. **Core Audio Tap** (preferred) — taps system audio via aggregate device.
///    Only shows purple dot, no Screen Recording permission needed.
/// 2. **ScreenCaptureKit** (fallback) — captures system audio via SCStream.
///    Requires Screen Recording permission.
/// 3. **Voice Processing AEC** — uses Apple's built-in echo cancellation
///    AudioUnit for clean mic audio. Replaces simple AVAudioEngine capture.
///
/// Output: Three 16kHz mono 16-bit PCM WAV files (system, mic, combined).
public final class MeetingRecorder {
    private var coreAudioTap: Any? = nil  // CoreAudioTapCapture (macOS 14.2+)
    private let sckCapture = SystemAudioCapture()  // fallback
    private let aecCapture = VoiceProcessingAEC()
    private let simpleMic = MicrophoneCapture()     // fallback if AEC fails

    private var systemWriter: WAVWriter?
    private var micWriter: WAVWriter?
    private var combinedWriter: WAVWriter?
    private let lock = NSLock()

    public private(set) var isRecording = false
    public private(set) var startTime: Date?
    public private(set) var outputDirectory: URL?
    public private(set) var captureMethod: String = "none"
    public private(set) var aecEnabled = false
    public private(set) var systemBufferCount: UInt64 = 0
    public private(set) var micBufferCount: UInt64 = 0

    public init() {}

    // MARK: - Capabilities

    public struct Capabilities: Codable {
        public let hasCoreAudioTaps: Bool
        public let hasScreenCaptureKit: Bool
        public let hasAEC: Bool
        public let defaultInputDevice: String
    }

    public static func getCapabilities() -> Capabilities {
        let hasInput: String = {
            let engine = AVAudioEngine()
            let format = engine.inputNode.outputFormat(forBus: 0)
            return "\(format.sampleRate)Hz \(format.channelCount)ch"
        }()

        var hasTaps = false
        if #available(macOS 14.2, *) {
            hasTaps = CoreAudioTapCapture.isAvailable
        }

        return Capabilities(
            hasCoreAudioTaps: hasTaps,
            hasScreenCaptureKit: true,
            hasAEC: true,
            defaultInputDevice: hasInput
        )
    }

    // MARK: - Recording

    public func start(preferCoreAudioTap: Bool = true) async throws -> RecordingStartResult {
        guard !isRecording else { throw RecorderError.alreadyRecording }

        // Create output directory
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("kestrel-recordings")
            .appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        outputDirectory = tempDir

        let systemURL = tempDir.appendingPathComponent("system.wav")
        let micURL = tempDir.appendingPathComponent("mic.wav")
        let combinedURL = tempDir.appendingPathComponent("combined.wav")

        systemWriter = try WAVWriter(url: systemURL)
        micWriter = try WAVWriter(url: micURL)
        combinedWriter = try WAVWriter(url: combinedURL)

        isRecording = true
        startTime = Date()
        systemBufferCount = 0
        micBufferCount = 0

        // ── System audio: try Core Audio Tap first, fall back to SCK ──
        var usedCoreAudioTap = false
        if #available(macOS 14.2, *), preferCoreAudioTap {
            do {
                let tap = CoreAudioTapCapture()
                self.coreAudioTap = tap
                try tap.start { [weak self] buffer in
                    self?.handleSystemBuffer(buffer)
                }
                captureMethod = "coreAudioTap"
                usedCoreAudioTap = true
                log("Using Core Audio Tap for system audio")
            } catch {
                log("Core Audio Tap failed, falling back to ScreenCaptureKit: \(error)")
                coreAudioTap = nil
            }
        }

        if !usedCoreAudioTap {
            try await sckCapture.start { [weak self] buffer in
                self?.handleSystemBuffer(buffer)
            }
            captureMethod = "screenCaptureKit"
            log("Using ScreenCaptureKit for system audio")
        }

        // ── Microphone: use simple AVAudioEngine capture (reliable) ──
        // AEC via Voice Processing IO has a buffer delivery bug — use simple mic for now
        do {
            try simpleMic.start { [weak self] buffer in
                self?.handleMicBuffer(buffer)
            }
            aecEnabled = false
            log("Using AVAudioEngine microphone capture")
        } catch {
            log("Mic capture failed: \(error)")
        }

        let result = RecordingStartResult(
            status: "recording",
            systemAudioPath: systemURL.path,
            micAudioPath: micURL.path,
            combinedAudioPath: combinedURL.path,
            captureMethod: captureMethod,
            aecEnabled: aecEnabled
        )

        log("Recording started: \(tempDir.path)")
        log("  System: \(captureMethod), AEC: \(aecEnabled)")
        return result
    }

    private func handleSystemBuffer(_ buffer: AVAudioPCMBuffer) {
        guard isRecording else { return }
        systemBufferCount += 1
        lock.lock()
        try? systemWriter?.write(buffer)
        try? combinedWriter?.write(buffer)
        lock.unlock()
    }

    private func handleMicBuffer(_ buffer: AVAudioPCMBuffer) {
        guard isRecording else { return }
        micBufferCount += 1
        lock.lock()
        try? micWriter?.write(buffer)
        try? combinedWriter?.write(buffer)
        lock.unlock()
    }

    public func stop() -> RecordingResult {
        guard isRecording else {
            return RecordingResult(
                systemAudioPath: nil, micAudioPath: nil, combinedAudioPath: nil,
                durationSeconds: 0, captureMethod: captureMethod, aecEnabled: aecEnabled
            )
        }

        isRecording = false
        let duration = startTime.map { Date().timeIntervalSince($0) } ?? 0

        // Stop all capture streams
        if #available(macOS 14.2, *), let tap = coreAudioTap as? CoreAudioTapCapture {
            tap.stop()
        }
        coreAudioTap = nil
        sckCapture.stop()
        aecCapture.stop()
        simpleMic.stop()

        // Close writers
        lock.lock()
        systemWriter?.close()
        micWriter?.close()
        combinedWriter?.close()
        lock.unlock()

        let result = RecordingResult(
            systemAudioPath: outputDirectory?.appendingPathComponent("system.wav").path,
            micAudioPath: outputDirectory?.appendingPathComponent("mic.wav").path,
            combinedAudioPath: outputDirectory?.appendingPathComponent("combined.wav").path,
            durationSeconds: duration,
            captureMethod: captureMethod,
            aecEnabled: aecEnabled
        )

        log("Recording stopped. Duration: \(String(format: "%.1f", duration))s")
        log("  System buffers: \(systemBufferCount), Mic buffers: \(micBufferCount)")
        if let path = result.combinedAudioPath {
            let size = (try? FileManager.default.attributesOfItem(atPath: path)[.size] as? UInt64) ?? 0
            log("  Combined WAV: \(size / 1024)KB")
        }

        return result
    }

    public var durationSeconds: Double {
        guard let start = startTime, isRecording else { return 0 }
        return Date().timeIntervalSince(start)
    }

    public var status: RecordingStatus {
        RecordingStatus(
            recording: isRecording,
            durationSeconds: durationSeconds,
            captureMethod: captureMethod,
            aecEnabled: aecEnabled,
            systemBufferCount: systemBufferCount,
            micBufferCount: micBufferCount
        )
    }
}

// MARK: - Types

public struct RecordingStartResult: Codable {
    public let status: String
    public let systemAudioPath: String
    public let micAudioPath: String
    public let combinedAudioPath: String
    public let captureMethod: String
    public let aecEnabled: Bool
}

public struct RecordingResult: Codable {
    public let systemAudioPath: String?
    public let micAudioPath: String?
    public let combinedAudioPath: String?
    public let durationSeconds: Double
    public let captureMethod: String
    public let aecEnabled: Bool
}

public struct RecordingStatus: Codable {
    public let recording: Bool
    public let durationSeconds: Double
    public let captureMethod: String
    public let aecEnabled: Bool
    public let systemBufferCount: UInt64
    public let micBufferCount: UInt64
}

public struct RecordingInfo: Codable {
    public let systemAudioPath: String
    public let micAudioPath: String
    public let combinedAudioPath: String
    public let startTime: Date
}

public enum RecorderError: Error, CustomStringConvertible {
    case alreadyRecording
    case notRecording

    public var description: String {
        switch self {
        case .alreadyRecording: return "Already recording"
        case .notRecording: return "Not recording"
        }
    }
}

private func log(_ msg: String) {
    FileHandle.standardError.write(Data("[recorder] \(msg)\n".utf8))
}
