import ApplicationServices
import AppKit

/// Low-level helpers for working with AXUIElement
public enum AXHelpers {

    /// Read a single attribute from an element
    public static func value<T>(_ element: AXUIElement, attribute: String) -> T? {
        var ref: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &ref)
        guard result == .success else { return nil }
        return ref as? T
    }

    /// Get the role of an element
    public static func role(_ element: AXUIElement) -> String? {
        value(element, attribute: kAXRoleAttribute)
    }

    /// Get text value
    public static func textValue(_ element: AXUIElement) -> String? {
        value(element, attribute: kAXValueAttribute)
    }

    /// Get title
    public static func title(_ element: AXUIElement) -> String? {
        value(element, attribute: kAXTitleAttribute)
    }

    /// Get children
    public static func children(_ element: AXUIElement) -> [AXUIElement] {
        value(element, attribute: kAXChildrenAttribute) ?? []
    }

    /// Get focused window
    public static func focusedWindow(_ app: AXUIElement) -> AXUIElement? {
        value(app, attribute: kAXFocusedWindowAttribute)
    }

    /// Get AXUIElement for a running application by PID
    public static func appElement(pid: pid_t) -> AXUIElement {
        AXUIElementCreateApplication(pid)
    }

    /// Get the frontmost application info
    public static func getFrontmostApp() -> FrontmostAppInfo? {
        guard let app = NSWorkspace.shared.frontmostApplication,
              let bundleId = app.bundleIdentifier else { return nil }

        let axApp = AXUIElementCreateApplication(app.processIdentifier)
        let windowTitle: String? = {
            guard let window: AXUIElement = value(axApp, attribute: kAXFocusedWindowAttribute) else {
                return nil
            }
            return title(window)
        }()

        return FrontmostAppInfo(
            name: app.localizedName ?? "Unknown",
            bundleId: bundleId,
            pid: app.processIdentifier,
            windowTitle: windowTitle
        )
    }

    /// Check if accessibility permission is granted
    public static func checkAccessibility(prompt: Bool = false) -> Bool {
        if prompt {
            let options: NSDictionary = [
                kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true
            ]
            return AXIsProcessTrustedWithOptions(options)
        }
        return AXIsProcessTrusted()
    }
}
