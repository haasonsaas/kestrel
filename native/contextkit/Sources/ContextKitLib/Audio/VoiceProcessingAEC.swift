import AudioToolbox
import AVFoundation
import CoreAudio

/// Provides echo cancellation using Apple's Voice Processing AudioUnit.
/// This is the built-in AEC that macOS provides — comparable to WebRTC AEC3.
/// It removes echo between the microphone and speaker output.
public final class VoiceProcessingAEC {
    fileprivate var audioUnit: AudioComponentInstance?
    private let resampler = AudioResampler()
    private var onBuffer: ((AVAudioPCMBuffer) -> Void)?
    public private(set) var isRunning = false
    public private(set) var bufferCount: UInt64 = 0

    public init() {}

    /// Start the Voice Processing AudioUnit which provides:
    /// - Acoustic Echo Cancellation (AEC)
    /// - Noise Suppression
    /// - Automatic Gain Control
    public func start(onBuffer: @escaping (AVAudioPCMBuffer) -> Void) throws {
        guard !isRunning else { return }
        self.onBuffer = onBuffer
        bufferCount = 0

        // Find Voice Processing AudioUnit
        var componentDesc = AudioComponentDescription(
            componentType: kAudioUnitType_Output,
            componentSubType: kAudioUnitSubType_VoiceProcessingIO,
            componentManufacturer: kAudioUnitManufacturer_Apple,
            componentFlags: 0,
            componentFlagsMask: 0
        )

        guard let component = AudioComponentFindNext(nil, &componentDesc) else {
            throw AudioCaptureError.captureStartFailed("Voice Processing IO not found")
        }

        var unit: AudioComponentInstance?
        var err = AudioComponentInstanceNew(component, &unit)
        guard err == noErr, let unit else {
            throw AudioCaptureError.captureStartFailed("Failed to create VP AudioUnit: \(err)")
        }
        self.audioUnit = unit

        // Enable input (microphone with AEC)
        var enableInput: UInt32 = 1
        err = AudioUnitSetProperty(
            unit,
            kAudioOutputUnitProperty_EnableIO,
            kAudioUnitScope_Input,
            1, // input bus
            &enableInput,
            UInt32(MemoryLayout<UInt32>.size)
        )
        guard err == noErr else {
            throw AudioCaptureError.captureStartFailed("Failed to enable VP input: \(err)")
        }

        // Set up the input callback to receive AEC-processed audio
        var inputCallbackStruct = AURenderCallbackStruct(
            inputProc: vpInputCallback,
            inputProcRefCon: Unmanaged.passUnretained(self).toOpaque()
        )
        err = AudioUnitSetProperty(
            unit,
            kAudioOutputUnitProperty_SetInputCallback,
            kAudioUnitScope_Global,
            0,
            &inputCallbackStruct,
            UInt32(MemoryLayout<AURenderCallbackStruct>.size)
        )
        guard err == noErr else {
            throw AudioCaptureError.captureStartFailed("Failed to set VP callback: \(err)")
        }

        // Initialize and start
        err = AudioUnitInitialize(unit)
        guard err == noErr else {
            throw AudioCaptureError.captureStartFailed("Failed to initialize VP unit: \(err)")
        }

        err = AudioOutputUnitStart(unit)
        guard err == noErr else {
            throw AudioCaptureError.captureStartFailed("Failed to start VP unit: \(err)")
        }

        isRunning = true
        log("Voice Processing AEC started")
    }

    public func stop() {
        guard isRunning, let unit = audioUnit else { return }
        isRunning = false

        AudioOutputUnitStop(unit)
        AudioUnitUninitialize(unit)
        AudioComponentInstanceDispose(unit)
        audioUnit = nil

        log("Voice Processing AEC stopped (buffers: \(bufferCount))")
    }

    /// Called from the render callback — delivers AEC-processed mic audio
    fileprivate func handleInputBuffer(_ bufferList: UnsafeMutablePointer<AudioBufferList>,
                                       frameCount: UInt32,
                                       format: AudioStreamBasicDescription) {
        bufferCount += 1

        var mutableFormat = format
        guard let avFormat = AVAudioFormat(streamDescription: &mutableFormat) else { return }
        guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: avFormat, frameCapacity: frameCount) else { return }

        // Copy data from buffer list
        let status = pcmBuffer.mutableAudioBufferList.pointee.mBuffers.mData != nil
        if status {
            pcmBuffer.frameLength = frameCount
            memcpy(
                pcmBuffer.mutableAudioBufferList.pointee.mBuffers.mData,
                bufferList.pointee.mBuffers.mData,
                Int(bufferList.pointee.mBuffers.mDataByteSize)
            )
            pcmBuffer.mutableAudioBufferList.pointee.mBuffers.mDataByteSize = bufferList.pointee.mBuffers.mDataByteSize
        }

        // Resample to 16kHz mono
        if let resampled = resampler.resample(pcmBuffer) {
            onBuffer?(resampled)
        }
    }

    deinit { stop() }
}

// C-level callback — bridges to the Swift instance
private func vpInputCallback(
    inRefCon: UnsafeMutableRawPointer,
    ioActionFlags: UnsafeMutablePointer<AudioUnitRenderActionFlags>,
    inTimeStamp: UnsafePointer<AudioTimeStamp>,
    inBusNumber: UInt32,
    inNumberFrames: UInt32,
    ioData: UnsafeMutablePointer<AudioBufferList>?
) -> OSStatus {
    let aec = Unmanaged<VoiceProcessingAEC>.fromOpaque(inRefCon).takeUnretainedValue()
    guard aec.isRunning, let unit = aec.audioUnit else { return noErr }

    // Allocate buffer for the rendered audio
    let bytesPerFrame: UInt32 = 4 // Float32
    let dataSize = inNumberFrames * bytesPerFrame
    let data = UnsafeMutableRawPointer.allocate(byteCount: Int(dataSize), alignment: 4)
    defer { data.deallocate() }

    var bufferList = AudioBufferList(
        mNumberBuffers: 1,
        mBuffers: AudioBuffer(
            mNumberChannels: 1,
            mDataByteSize: dataSize,
            mData: data
        )
    )

    // Render the AEC-processed input
    let err = AudioUnitRender(
        unit,
        ioActionFlags,
        inTimeStamp,
        1, // input bus
        inNumberFrames,
        &bufferList
    )

    if err == noErr {
        // Get the stream format for this bus
        var format = AudioStreamBasicDescription()
        var formatSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        AudioUnitGetProperty(
            unit,
            kAudioUnitProperty_StreamFormat,
            kAudioUnitScope_Output,
            1,
            &format,
            &formatSize
        )

        aec.handleInputBuffer(&bufferList, frameCount: inNumberFrames, format: format)
    }

    return noErr
}

private func log(_ msg: String) {
    FileHandle.standardError.write(Data("[aec] \(msg)\n".utf8))
}
