import AudioToolbox
import AppKit

/// Detects which processes are actively using the microphone via CoreAudio.
/// This is the gold standard for meeting detection — works regardless of which
/// app is frontmost, no Accessibility or Screen Recording permission needed.
///
/// When Zoom/Meet/Teams are in an active call, they grab the mic input.
/// We detect that by querying kAudioProcessPropertyIsRunningInput.
public enum MicActivityDetector {

    /// Known meeting app bundle IDs
    private static let meetingBundleIDs: [String: String] = [
        "us.zoom.xos": "Zoom",
        "us.zoom.CptHost": "Zoom",          // Zoom in-meeting helper
        "us.zoom.Workplace": "Zoom",
        "com.microsoft.teams": "Microsoft Teams",
        "com.microsoft.teams2": "Microsoft Teams",
        "com.cisco.webexmeetingsapp": "Webex",
        "Cisco-Systems.Spark": "Webex",
        "com.tinyspeck.slackmacgap": "Slack",
        "com.hnc.Discord": "Discord",
        "com.apple.FaceTime": "FaceTime",
        "com.skype.skype": "Skype",
        "com.gotomeeting.GoToMeeting": "GoTo Meeting",
        "com.ringcentral.ringcentral": "RingCentral",
        "app.tuple.app": "Tuple",
        // Browser renderers that handle WebRTC
        "com.google.Chrome.helper": "Google Chrome",
        "com.google.Chrome.helper.renderer": "Google Chrome",
        "com.brave.Browser.helper.renderer": "Brave",
        "company.thebrowser.browser.helper.renderer": "Arc",
        "com.apple.WebKit.WebContent": "Safari",
    ]

    public struct MicUser: Codable {
        public let bundleId: String
        public let appName: String
        public let pid: Int32
    }

    public struct DetectionResult: Codable {
        public let meetingDetected: Bool
        public let micUsers: [MicUser]
        public let meetingApp: String?
    }

    /// Query CoreAudio for all processes currently using the microphone input.
    /// Returns the list of meeting-related apps that have active mic input.
    public static func detect() -> DetectionResult {
        var micUsers: [MicUser] = []

        // Get the list of audio process objects
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyProcessObjectList,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )

        var dataSize: UInt32 = 0
        var err = AudioObjectGetPropertyDataSize(
            AudioObjectID(kAudioObjectSystemObject),
            &address, 0, nil, &dataSize
        )
        guard err == noErr, dataSize > 0 else { return DetectionResult(meetingDetected: false, micUsers: [], meetingApp: nil) }

        let count = Int(dataSize) / MemoryLayout<AudioObjectID>.size
        var processIDs = [AudioObjectID](repeating: 0, count: count)

        err = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &address, 0, nil, &dataSize, &processIDs
        )
        guard err == noErr else { return DetectionResult(meetingDetected: false, micUsers: [], meetingApp: nil) }

        // Check each process for active mic input
        for processID in processIDs {
            guard isRunningInput(processID) else { continue }

            let bundleID = getBundleID(processID)
            let pid = getPID(processID)

            guard let bundleID, !bundleID.isEmpty else { continue }

            // Skip our own process
            if bundleID.contains("kestrel") || bundleID.contains("contextkit") { continue }

            let appName = meetingBundleIDs[bundleID]
                ?? resolveAppName(bundleID: bundleID)
                ?? bundleID

            micUsers.append(MicUser(bundleId: bundleID, appName: appName, pid: pid))
        }

        // Check if any mic user is a known meeting app
        let meetingApp = micUsers.first { meetingBundleIDs[$0.bundleId] != nil }

        return DetectionResult(
            meetingDetected: meetingApp != nil || micUsers.contains { isBrowserMeeting($0.bundleId) },
            micUsers: micUsers,
            meetingApp: meetingApp.map { meetingBundleIDs[$0.bundleId] ?? $0.appName }
                ?? micUsers.first { isBrowserMeeting($0.bundleId) }.map { $0.appName + " (browser call)" }
        )
    }

    // MARK: - Private helpers

    private static func isRunningInput(_ processID: AudioObjectID) -> Bool {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioProcessPropertyIsRunningInput,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )

        var isRunning: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)

        let err = AudioObjectGetPropertyData(processID, &address, 0, nil, &size, &isRunning)
        return err == noErr && isRunning != 0
    }

    private static func getBundleID(_ processID: AudioObjectID) -> String? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioProcessPropertyBundleID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )

        var bundleID: CFString = "" as CFString
        var size = UInt32(MemoryLayout<CFString>.size)

        let err = AudioObjectGetPropertyData(processID, &address, 0, nil, &size, &bundleID)
        guard err == noErr else { return nil }
        return bundleID as String
    }

    private static func getPID(_ processID: AudioObjectID) -> Int32 {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioProcessPropertyPID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )

        var pid: Int32 = 0
        var size = UInt32(MemoryLayout<Int32>.size)

        AudioObjectGetPropertyData(processID, &address, 0, nil, &size, &pid)
        return pid
    }

    private static func isBrowserMeeting(_ bundleId: String) -> Bool {
        return bundleId.contains("Chrome.helper") ||
               bundleId.contains("browser.helper") ||
               bundleId == "com.apple.WebKit.WebContent"
    }

    private static func resolveAppName(bundleID: String) -> String? {
        // Try to get the app name from running applications
        for app in NSWorkspace.shared.runningApplications {
            if app.bundleIdentifier == bundleID {
                return app.localizedName
            }
        }
        // Fall back to the last component of the bundle ID
        return bundleID.components(separatedBy: ".").last
    }
}
