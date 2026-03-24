import ApplicationServices

public enum PermissionChecker {
    public static func check() -> PermissionState {
        PermissionState(accessibility: AXIsProcessTrusted())
    }

    public static func requestIfNeeded() -> PermissionState {
        let options: NSDictionary = [
            kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true
        ]
        let granted = AXIsProcessTrustedWithOptions(options)
        return PermissionState(accessibility: granted)
    }
}
