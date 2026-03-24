import ApplicationServices

/// Recursively walks the accessibility tree and collects text content
public enum AXTreeWalker {

    // Bundle IDs to skip — ourselves + sensitive apps that should never be read
    private static let excludedBundleIDs: Set<String> = [
        // Kestrel itself
        "com.kestrel.app",
        "com.github.electron",
        "com.electron.kestrel",

        // Password managers — NEVER read these
        "com.1password.1password",
        "com.1password.1password.v7",
        "com.1password.browser-support",
        "com.agilebits.onepassword7",
        "com.agilebits.onepassword-osx",
        "com.bitwarden.desktop",
        "com.lastpass.LastPass",
        "com.dashlane.dashlanephonefinal",
        "com.keepersecurity.keeper",
        "org.nickvision.denaro",           // Denaro password manager
        "com.enpass.Enpass",

        // Keychain / System auth
        "com.apple.keychainaccess",
        "com.apple.systempreferences",     // Could show security settings

        // Banking / Finance apps
        "com.mint.Mint",
        "com.intuit.quickbooks",

        // VPN / Security tools
        "com.wireguard.macos",
        "com.tailscale.ipn.macos",

        // SSH / Key management
        "com.panic.Transmit",
        "se.filezilla-project.filezilla",
    ]

    // Cache the last non-self context so we can return it when the user is in Kestrel
    private static var lastExternalContext: AppContext?

    /// Collect all meaningful text from an element subtree
    public static func collectText(
        from element: AXUIElement,
        depth: Int = 0,
        maxDepth: Int = 15
    ) -> [String] {
        guard depth < maxDepth else { return [] }

        var texts: [String] = []

        let value: String? = AXHelpers.textValue(element)
        let title: String? = AXHelpers.title(element)

        if let v = value, !v.isEmpty, v.count > 1 {
            texts.append(v)
        } else if let t = title, !t.isEmpty, t.count > 1 {
            texts.append(t)
        }

        for child in AXHelpers.children(element) {
            texts.append(contentsOf: collectText(from: child, depth: depth + 1, maxDepth: maxDepth))
        }

        return texts
    }

    /// Find the first element with a specific role in the tree
    public static func findFirst(
        in element: AXUIElement,
        withRole targetRole: String,
        depth: Int = 0,
        maxDepth: Int = 15
    ) -> AXUIElement? {
        guard depth < maxDepth else { return nil }
        if AXHelpers.role(element) == targetRole { return element }
        for child in AXHelpers.children(element) {
            if let found = findFirst(in: child, withRole: targetRole, depth: depth + 1, maxDepth: maxDepth) {
                return found
            }
        }
        return nil
    }

    /// Get the full context from the frontmost app.
    /// If the frontmost app is Kestrel itself, returns the last captured external context.
    public static func getContext() -> AppContext? {
        guard let frontApp = AXHelpers.getFrontmostApp() else {
            return lastExternalContext
        }

        // If the frontmost app is us, return the cached external context
        let isOurApp = excludedBundleIDs.contains(frontApp.bundleId) ||
                       frontApp.name.lowercased().contains("electron") ||
                       frontApp.name.lowercased().contains("kestrel")
        if isOurApp {
            return lastExternalContext
        }

        let axApp = AXHelpers.appElement(pid: frontApp.pid)
        let window = AXHelpers.focusedWindow(axApp)

        // Collect text from the focused window
        var visibleText: [String] = []
        if let window = window {
            let rawText = collectText(from: window, maxDepth: 12)
            var seen = Set<String>()
            for text in rawText {
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.count > 2, !seen.contains(trimmed) {
                    seen.insert(trimmed)
                    visibleText.append(trimmed)
                }
                if visibleText.count >= 150 { break }
            }
        }

        let url = BrowserParser.getURL(bundleId: frontApp.bundleId)

        let context = AppContext(
            appName: frontApp.name,
            bundleId: frontApp.bundleId,
            windowTitle: frontApp.windowTitle,
            url: url?.url,
            pageTitle: url?.title ?? frontApp.windowTitle,
            visibleText: visibleText.isEmpty ? nil : visibleText
        )

        // Cache this as the last external context
        lastExternalContext = context

        return context
    }
}
