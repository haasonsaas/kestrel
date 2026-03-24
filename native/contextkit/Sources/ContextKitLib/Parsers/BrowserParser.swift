import Foundation
import AppKit

public struct BrowserURLResult {
    public let url: String?
    public let title: String?
}

/// Reads browser tab URLs via AppleScript
public enum BrowserParser {

    private static let chromiumBundleIds: Set<String> = [
        "com.google.Chrome",
        "com.google.Chrome.canary",
        "com.brave.Browser",
        "com.microsoft.edgemac",
        "com.vivaldi.Vivaldi",
        "com.operasoftware.Opera"
    ]

    private static let safariBundleIds: Set<String> = [
        "com.apple.Safari",
        "com.apple.SafariTechnologyPreview"
    ]

    public static func getURL(bundleId: String) -> BrowserURLResult? {
        if safariBundleIds.contains(bundleId) {
            return getSafariURL()
        } else if chromiumBundleIds.contains(bundleId) {
            return getChromiumURL(bundleId: bundleId)
        } else if bundleId == "company.thebrowser.Browser" {
            return getArcURL()
        }
        // Firefox doesn't support AppleScript URL reading
        return nil
    }

    private static func getSafariURL() -> BrowserURLResult? {
        let script = """
        tell application "Safari"
            set tabURL to URL of current tab of front window
            set tabTitle to name of current tab of front window
            return tabURL & "\\n" & tabTitle
        end tell
        """
        return runAppleScript(script)
    }

    private static func getChromiumURL(bundleId: String) -> BrowserURLResult? {
        let script = """
        tell application id "\(bundleId)"
            set tabURL to URL of active tab of front window
            set tabTitle to title of active tab of front window
            return tabURL & "\\n" & tabTitle
        end tell
        """
        return runAppleScript(script)
    }

    private static func getArcURL() -> BrowserURLResult? {
        let script = """
        tell application "Arc"
            set tabURL to URL of active tab of front window
            set tabTitle to title of active tab of front window
            return tabURL & "\\n" & tabTitle
        end tell
        """
        return runAppleScript(script)
    }

    private static func runAppleScript(_ source: String) -> BrowserURLResult? {
        var error: NSDictionary?
        guard let appleScript = NSAppleScript(source: source) else { return nil }
        let result = appleScript.executeAndReturnError(&error)
        if error != nil { return nil }
        guard let output = result.stringValue else { return nil }
        let parts = output.components(separatedBy: "\n")
        return BrowserURLResult(
            url: parts.first,
            title: parts.count > 1 ? parts[1] : nil
        )
    }
}
