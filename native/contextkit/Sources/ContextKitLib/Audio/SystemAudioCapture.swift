import ScreenCaptureKit
import AVFoundation
import CoreMedia

/// Captures system audio using ScreenCaptureKit (macOS 14+)
/// Falls back gracefully if permission is denied.
public final class SystemAudioCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private let outputQueue = DispatchQueue(label: "com.kestrel.system-audio")
    private let resampler = AudioResampler()
    private var onBuffer: ((AVAudioPCMBuffer) -> Void)?
    private(set) public var isRunning = false

    public override init() {
        super.init()
    }

    public func start(onBuffer: @escaping (AVAudioPCMBuffer) -> Void) async throws {
        self.onBuffer = onBuffer

        // Get shareable content
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let display = content.displays.first else {
            throw AudioCaptureError.noDisplay
        }

        // Filter for the whole display
        let filter = SCContentFilter(display: display, excludingWindows: [])

        // Configure for audio capture (minimize video overhead)
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48000
        config.channelCount = 2

        // Minimize video — must still have a screen handler to avoid framework errors
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 FPS

        // Create stream
        stream = SCStream(filter: filter, configuration: config, delegate: self)

        // Must add screen output handler (SCK requirement even for audio-only)
        try stream?.addStreamOutput(self, type: .screen, sampleHandlerQueue: outputQueue)
        try stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: outputQueue)

        try await stream?.startCapture()
        isRunning = true
        log("System audio capture started (ScreenCaptureKit)")
    }

    public func stop() {
        guard isRunning else { return }
        Task {
            try? await stream?.stopCapture()
            stream = nil
        }
        isRunning = false
        log("System audio capture stopped")
    }

    // MARK: - SCStreamOutput

    public func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
                       of outputType: SCStreamOutputType) {
        switch outputType {
        case .audio:
            handleAudioBuffer(sampleBuffer)
        case .screen:
            break // Discard video frames
        @unknown default:
            break
        }
    }

    private func handleAudioBuffer(_ sampleBuffer: CMSampleBuffer) {
        guard let pcmBuffer = convertToPCMBuffer(sampleBuffer) else { return }

        // Resample to 16kHz mono
        if let resampled = resampler.resample(pcmBuffer) {
            onBuffer?(resampled)
        }
    }

    private func convertToPCMBuffer(_ sampleBuffer: CMSampleBuffer) -> AVAudioPCMBuffer? {
        guard let formatDesc = sampleBuffer.formatDescription else { return nil }
        let format = AVAudioFormat(cmAudioFormatDescription: formatDesc)
        let frameCount = AVAudioFrameCount(sampleBuffer.numSamples)
        guard frameCount > 0 else { return nil }

        guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return nil }
        pcmBuffer.frameLength = frameCount

        let status = CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sampleBuffer,
            at: 0,
            frameCount: Int32(frameCount),
            into: pcmBuffer.mutableAudioBufferList
        )

        return status == noErr ? pcmBuffer : nil
    }

    // MARK: - SCStreamDelegate

    public func stream(_ stream: SCStream, didStopWithError error: Error) {
        log("Stream stopped with error: \(error.localizedDescription)")
        isRunning = false
        // Auto-restart after a delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            guard let self, !self.isRunning, self.onBuffer != nil else { return }
            log("Attempting auto-restart...")
            Task {
                try? await self.start(onBuffer: self.onBuffer!)
            }
        }
    }

    deinit { stop() }
}

public enum AudioCaptureError: Error, CustomStringConvertible {
    case noDisplay
    case permissionDenied
    case captureStartFailed(String)

    public var description: String {
        switch self {
        case .noDisplay: return "No display found for audio capture"
        case .permissionDenied: return "Screen recording permission denied"
        case .captureStartFailed(let msg): return "Capture start failed: \(msg)"
        }
    }
}

private func log(_ msg: String) {
    FileHandle.standardError.write(Data("[sys-audio] \(msg)\n".utf8))
}
