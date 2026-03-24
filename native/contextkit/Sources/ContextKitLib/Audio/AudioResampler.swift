import AVFoundation

/// Resamples audio from any format to 16kHz mono Float32 (Whisper-ready)
public final class AudioResampler {
    private var converter: AVAudioConverter?
    public let outputFormat: AVAudioFormat

    public init() {
        self.outputFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: 16000,
            channels: 1,
            interleaved: false
        )!
    }

    public func resample(_ inputBuffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        // Lazily create or recreate converter if input format changes
        if converter == nil || converter!.inputFormat != inputBuffer.format {
            converter = AVAudioConverter(from: inputBuffer.format, to: outputFormat)
        }
        guard let converter else { return nil }

        let ratio = outputFormat.sampleRate / inputBuffer.format.sampleRate
        let outputFrameCount = AVAudioFrameCount(Double(inputBuffer.frameLength) * ratio)
        guard outputFrameCount > 0 else { return nil }

        guard let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: outputFormat,
            frameCapacity: outputFrameCount + 64 // small padding
        ) else { return nil }

        // Reset converter state — endOfStream from previous call leaves it in a bad state
        converter.reset()

        var inputConsumed = false
        let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
            if inputConsumed {
                outStatus.pointee = .endOfStream
                return nil
            }
            inputConsumed = true
            outStatus.pointee = .haveData
            return inputBuffer
        }

        var error: NSError?
        let status = converter.convert(to: outputBuffer, error: &error, withInputFrom: inputBlock)

        switch status {
        case .haveData:
            return outputBuffer
        case .endOfStream, .inputRanDry:
            return outputBuffer.frameLength > 0 ? outputBuffer : nil
        case .error:
            log("Resample error: \(error?.localizedDescription ?? "unknown")")
            return nil
        @unknown default:
            return nil
        }
    }

    /// Extract raw Float32 samples from a resampled buffer
    public func extractFloats(_ buffer: AVAudioPCMBuffer) -> [Float] {
        guard let data = buffer.floatChannelData else { return [] }
        return Array(UnsafeBufferPointer(start: data[0], count: Int(buffer.frameLength)))
    }
}

private func log(_ msg: String) {
    FileHandle.standardError.write(Data("[resampler] \(msg)\n".utf8))
}
