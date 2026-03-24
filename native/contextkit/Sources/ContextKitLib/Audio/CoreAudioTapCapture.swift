import AudioToolbox
import AVFoundation
import CoreAudio

/// Captures system audio using Core Audio Process Taps (macOS 14.2+).
/// This is the Granola approach — creates a virtual aggregate device to tap all system audio.
/// Does NOT require Screen Recording permission — only triggers the purple audio indicator.
@available(macOS 14.2, *)
public final class CoreAudioTapCapture {
    private var processTapID: AudioObjectID = kAudioObjectUnknown
    private var aggregateDeviceID: AudioObjectID = kAudioObjectUnknown
    private var deviceProcID: AudioDeviceIOProcID?
    private var tapStreamDescription: AudioStreamBasicDescription?
    private let resampler = AudioResampler()
    private var onBuffer: ((AVAudioPCMBuffer) -> Void)?
    private let ioQueue = DispatchQueue(label: "com.kestrel.coreaudio-tap", qos: .userInteractive)

    public private(set) var isRunning = false
    public private(set) var bufferCount: UInt64 = 0

    public init() {}

    /// Check if Core Audio Taps are available on this system
    public static var isAvailable: Bool { true }

    public func start(onBuffer: @escaping (AVAudioPCMBuffer) -> Void) throws {
        guard !isRunning else { throw RecorderError.alreadyRecording }

        self.onBuffer = onBuffer
        bufferCount = 0

        // 1. Create a global stereo tap
        try createProcessTap()

        // 2. Read the tap's native audio format
        tapStreamDescription = try readTapStreamFormat()

        // 3. Get default output device UID
        let outputDeviceID = try getDefaultOutputDevice()
        let outputUID = try getDeviceUID(outputDeviceID)

        // 4. Create aggregate device with the tap
        try createAggregateDevice(outputUID: outputUID)

        // 5. Start the IO callback
        try startIOProc()

        isRunning = true
        log("Core Audio Tap capture started (device: \(outputUID))")
    }

    public func stop() {
        guard isRunning else { return }
        isRunning = false

        if let procID = deviceProcID {
            AudioDeviceStop(aggregateDeviceID, procID)
            AudioDeviceDestroyIOProcID(aggregateDeviceID, procID)
            deviceProcID = nil
        }
        if aggregateDeviceID != kAudioObjectUnknown {
            AudioHardwareDestroyAggregateDevice(aggregateDeviceID)
            aggregateDeviceID = kAudioObjectUnknown
        }
        if processTapID != kAudioObjectUnknown {
            AudioHardwareDestroyProcessTap(processTapID)
            processTapID = kAudioObjectUnknown
        }

        log("Core Audio Tap capture stopped (buffers: \(bufferCount))")
    }

    deinit { stop() }

    // MARK: - Private: Tap Creation

    private func createProcessTap() throws {
        // CATapDescription for stereo global tap excluding no processes
        var tapDesc = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
        tapDesc.uuid = UUID()
        tapDesc.name = "Kestrel-Tap"

        var tapID: AudioObjectID = kAudioObjectUnknown
        let err = AudioHardwareCreateProcessTap(tapDesc, &tapID)
        guard err == noErr else {
            throw AudioCaptureError.captureStartFailed("Process tap creation failed: OSStatus \(err)")
        }
        self.processTapID = tapID
        log("Process tap created: \(tapID)")
    }

    private func readTapStreamFormat() throws -> AudioStreamBasicDescription {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioTapPropertyFormat,
            mScope: kAudioObjectPropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )

        var size: UInt32 = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        var format = AudioStreamBasicDescription()

        let err = AudioObjectGetPropertyData(processTapID, &propertyAddress, 0, nil, &size, &format)
        guard err == noErr else {
            throw AudioCaptureError.captureStartFailed("Failed to read tap format: \(err)")
        }

        log("Tap format: \(format.mSampleRate)Hz, \(format.mChannelsPerFrame)ch, \(format.mBitsPerChannel)bit")
        return format
    }

    // MARK: - Private: Aggregate Device

    private func createAggregateDevice(outputUID: String) throws {
        let aggUID = UUID().uuidString
        let description: [String: Any] = [
            kAudioAggregateDeviceNameKey: "Kestrel-Aggregate",
            kAudioAggregateDeviceUIDKey: aggUID,
            kAudioAggregateDeviceMainSubDeviceKey: outputUID,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceIsStackedKey: false,
            kAudioAggregateDeviceTapAutoStartKey: true,
            kAudioAggregateDeviceSubDeviceListKey: [
                [kAudioSubDeviceUIDKey: outputUID]
            ] as [[String: Any]],
            kAudioAggregateDeviceTapListKey: [
                [
                    kAudioSubTapDriftCompensationKey: true,
                    kAudioSubTapUIDKey: processTapID
                ]
            ] as [[String: Any]]
        ]

        var aggID: AudioObjectID = kAudioObjectUnknown
        let err = AudioHardwareCreateAggregateDevice(description as CFDictionary, &aggID)
        guard err == noErr else {
            throw AudioCaptureError.captureStartFailed("Aggregate device creation failed: \(err)")
        }
        self.aggregateDeviceID = aggID
        log("Aggregate device created: \(aggID)")
    }

    // MARK: - Private: IO Proc

    private func startIOProc() throws {
        guard var desc = tapStreamDescription else {
            throw AudioCaptureError.captureStartFailed("No tap format available")
        }

        guard let format = AVAudioFormat(streamDescription: &desc) else {
            throw AudioCaptureError.captureStartFailed("Could not create AVAudioFormat from tap")
        }

        let captureFormat = format
        let ioBlock: AudioDeviceIOBlock = { [weak self] _, inInputData, _, _, _ in
            guard let self, self.isRunning else { return }

            let bufferList = UnsafePointer(inInputData)
            guard let pcmBuffer = AVAudioPCMBuffer(
                pcmFormat: captureFormat,
                bufferListNoCopy: bufferList
            ) else { return }

            self.bufferCount += 1

            if let resampled = self.resampler.resample(pcmBuffer) {
                self.onBuffer?(resampled)
            }
        }

        var err = AudioDeviceCreateIOProcIDWithBlock(&deviceProcID, aggregateDeviceID, ioQueue, ioBlock)
        guard err == noErr else {
            throw AudioCaptureError.captureStartFailed("IO proc creation failed: \(err)")
        }

        err = AudioDeviceStart(aggregateDeviceID, deviceProcID)
        guard err == noErr else {
            throw AudioCaptureError.captureStartFailed("Device start failed: \(err)")
        }
    }

    // MARK: - Private: Device Helpers

    private func getDefaultOutputDevice() throws -> AudioObjectID {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var deviceID: AudioObjectID = kAudioObjectUnknown
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        let err = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &deviceID)
        guard err == noErr, deviceID != kAudioObjectUnknown else {
            throw AudioCaptureError.captureStartFailed("No default output device: \(err)")
        }
        return deviceID
    }

    private func getDeviceUID(_ deviceID: AudioObjectID) throws -> String {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceUID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var uid: CFString = "" as CFString
        var size = UInt32(MemoryLayout<CFString>.size)
        let err = AudioObjectGetPropertyData(deviceID, &addr, 0, nil, &size, &uid)
        guard err == noErr else {
            throw AudioCaptureError.captureStartFailed("Failed to get device UID: \(err)")
        }
        return uid as String
    }
}

private func log(_ msg: String) {
    FileHandle.standardError.write(Data("[ca-tap] \(msg)\n".utf8))
}
