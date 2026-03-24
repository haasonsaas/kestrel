import AVFoundation
import Foundation

/// Writes audio buffers to a WAV file (16kHz mono 16-bit PCM for Whisper)
public final class WAVWriter {
    private var audioFile: AVAudioFile?
    public let url: URL
    private let resampler = AudioResampler()

    public init(url: URL) throws {
        self.url = url
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 16000.0,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false
        ]
        self.audioFile = try AVAudioFile(
            forWriting: url,
            settings: settings,
            commonFormat: .pcmFormatFloat32,
            interleaved: false
        )
    }

    /// Write a pre-resampled 16kHz mono buffer
    public func write(_ buffer: AVAudioPCMBuffer) throws {
        try audioFile?.write(from: buffer)
    }

    /// Write from a raw buffer (will resample to 16kHz mono)
    public func writeResampled(from rawBuffer: AVAudioPCMBuffer) throws {
        guard let resampled = resampler.resample(rawBuffer) else {
            return // Skip if resample fails
        }
        try audioFile?.write(from: resampled)
    }

    /// Finalize and close the file
    public func close() {
        audioFile = nil
    }

    /// Get file size in bytes
    public var fileSize: UInt64 {
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attrs[.size] as? UInt64 else { return 0 }
        return size
    }
}
