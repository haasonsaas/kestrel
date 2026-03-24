import AudioToolbox
import AVFoundation

/// Captures microphone audio using AudioQueue on a dedicated thread.
public final class MicrophoneCapture {
    private var audioQueue: AudioQueueRef?
    private var converter: AVAudioConverter?
    private var onBuffer: ((AVAudioPCMBuffer) -> Void)?
    private(set) public var isRunning = false
    public private(set) var bufferCount: UInt64 = 0
    private var dedicatedThread: Thread?
    private var threadRunLoop: CFRunLoop?
    private let threadReady = DispatchSemaphore(value: 0)

    private let sampleRate: Float64 = 48000
    private let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: 16000,
        channels: 1,
        interleaved: false
    )!

    public init() {}

    public func start(onBuffer: @escaping (AVAudioPCMBuffer) -> Void) throws {
        guard !isRunning else { return }
        self.onBuffer = onBuffer
        bufferCount = 0

        var recordFormat = AudioStreamBasicDescription(
            mSampleRate: sampleRate,
            mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: kLinearPCMFormatFlagIsFloat | kLinearPCMFormatFlagIsPacked,
            mBytesPerPacket: 4, mFramesPerPacket: 1, mBytesPerFrame: 4,
            mChannelsPerFrame: 1, mBitsPerChannel: 32, mReserved: 0
        )

        let inputFormat = AVAudioFormat(streamDescription: &recordFormat)!
        converter = AVAudioConverter(from: inputFormat, to: targetFormat)

        // Spin up a dedicated thread with its own RunLoop for AudioQueue
        let thread = Thread { [weak self] in
            guard let self else { return }

            // Grab this thread's RunLoop
            let rl = CFRunLoopGetCurrent()!
            self.threadRunLoop = rl

            // Add a dummy timer to prevent the RunLoop from exiting immediately
            let timer = CFRunLoopTimerCreateWithHandler(nil, CFAbsoluteTimeGetCurrent() + 86400, 86400, 0, 0) { _ in }
            CFRunLoopAddTimer(rl, timer, .commonModes)

            // Create AudioQueue on THIS thread, scheduled on THIS RunLoop
            let selfPtr = Unmanaged.passUnretained(self).toOpaque()
            var queue: AudioQueueRef?
            let err = AudioQueueNewInput(
                &recordFormat,
                audioQueueCallback,
                selfPtr,
                rl,
                CFRunLoopMode.commonModes.rawValue as CFString,
                0,
                &queue
            )

            if err != noErr {
                log("AudioQueue create failed: \(err)")
                self.threadReady.signal()
                return
            }
            self.audioQueue = queue

            for _ in 0..<3 {
                var buffer: AudioQueueBufferRef?
                if AudioQueueAllocateBuffer(queue!, 32768, &buffer) == noErr, let buffer {
                    AudioQueueEnqueueBuffer(queue!, buffer, 0, nil)
                }
            }

            let startErr = AudioQueueStart(queue!, nil)
            if startErr != noErr {
                log("AudioQueue start failed: \(startErr)")
            }

            self.isRunning = true
            log("Mic started on dedicated thread (RunLoop active)")

            // Signal that we're ready
            self.threadReady.signal()

            // Run this thread's RunLoop — this blocks until CFRunLoopStop is called
            CFRunLoopRun()
            log("Audio thread RunLoop stopped")
        }
        thread.name = "com.kestrel.mic-audio"
        thread.qualityOfService = .userInteractive
        thread.start()
        self.dedicatedThread = thread

        // Wait for the thread to set up
        threadReady.wait()

        if !isRunning {
            throw AudioCaptureError.captureStartFailed("AudioQueue failed to start on audio thread")
        }

        log("Microphone capture started")
    }

    fileprivate func handleBuffer(_ inBuffer: AudioQueueBufferRef) {
        guard isRunning, let converter else { return }
        bufferCount += 1

        let frameCount = inBuffer.pointee.mAudioDataByteSize / 4
        guard frameCount > 0 else { return }

        var inputASBD = AudioStreamBasicDescription(
            mSampleRate: sampleRate, mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: kLinearPCMFormatFlagIsFloat | kLinearPCMFormatFlagIsPacked,
            mBytesPerPacket: 4, mFramesPerPacket: 1, mBytesPerFrame: 4,
            mChannelsPerFrame: 1, mBitsPerChannel: 32, mReserved: 0
        )
        guard let inFmt = AVAudioFormat(streamDescription: &inputASBD),
              let inputPCM = AVAudioPCMBuffer(pcmFormat: inFmt, frameCapacity: AVAudioFrameCount(frameCount)) else { return }
        inputPCM.frameLength = AVAudioFrameCount(frameCount)
        memcpy(inputPCM.floatChannelData![0], inBuffer.pointee.mAudioData, Int(inBuffer.pointee.mAudioDataByteSize))

        let outFrames = AVAudioFrameCount(Double(frameCount) * 16000.0 / sampleRate)
        guard outFrames > 0,
              let outBuf = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: outFrames + 64) else { return }

        // AVAudioConverter is stateful — reset before each conversion to avoid
        // stale endOfStream state from the previous call's inputBlock
        converter.reset()

        var consumed = false
        let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
            if consumed { outStatus.pointee = .endOfStream; return nil }
            consumed = true
            outStatus.pointee = .haveData
            return inputPCM
        }

        var convErr: NSError?
        let result = converter.convert(to: outBuf, error: &convErr, withInputFrom: inputBlock)
        if (result == .haveData || result == .inputRanDry || result == .endOfStream),
           outBuf.frameLength > 0 {
            onBuffer?(outBuf)
        }

        if bufferCount <= 3 || bufferCount % 100 == 0 {
            log("Mic #\(bufferCount): \(frameCount)→\(outBuf.frameLength) frames")
        }
    }

    public func stop() {
        guard isRunning else { return }
        isRunning = false
        if let q = audioQueue {
            AudioQueueStop(q, true)
            AudioQueueDispose(q, true)
        }
        audioQueue = nil
        if let rl = threadRunLoop {
            CFRunLoopStop(rl)
        }
        dedicatedThread = nil
        threadRunLoop = nil
        log("Microphone stopped (buffers: \(bufferCount))")
    }

    deinit { stop() }
}

private func audioQueueCallback(
    inUserData: UnsafeMutableRawPointer?,
    inAQ: AudioQueueRef,
    inBuffer: AudioQueueBufferRef,
    inStartTime: UnsafePointer<AudioTimeStamp>,
    inNumPackets: UInt32,
    inPacketDesc: UnsafePointer<AudioStreamPacketDescription>?
) {
    guard let userData = inUserData else { return }
    let mic = Unmanaged<MicrophoneCapture>.fromOpaque(userData).takeUnretainedValue()
    mic.handleBuffer(inBuffer)
    if mic.isRunning {
        AudioQueueEnqueueBuffer(inAQ, inBuffer, 0, nil)
    }
}

private func log(_ msg: String) {
    FileHandle.standardError.write(Data("[mic] \(msg)\n".utf8))
}
