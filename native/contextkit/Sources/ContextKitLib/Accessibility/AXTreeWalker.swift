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

    /// Bundle IDs for apps that have per-app parsers on the TypeScript side.
    /// When the frontmost app matches, we return the full AX tree structure.
    private static let parserBundleIDs: Set<String> = [
        // Slack (native)
        "com.tinyspeck.slackmacgap",
        // Apple Messages
        "com.apple.MobileSMS",
        // WhatsApp
        "net.whatsapp.WhatsApp",
        // Facebook Messenger
        "com.facebook.archon",
    ]

    /// URL patterns for browser-based parsers (Gmail, etc.)
    /// Checked against the page URL when the frontmost app is a browser.
    private static let parserURLPatterns: [String] = [
        "mail.google.com",
    ]

    /// Recursively build an AXNode tree from an AXUIElement.
    /// Only collects attributes actually needed by parsers.
    public static func collectTree(
        from element: AXUIElement,
        depth: Int = 0,
        maxDepth: Int = 20
    ) -> AXNode {
        let role = AXHelpers.role(element)
        let subrole: String? = AXHelpers.subrole(element)
        let title = AXHelpers.title(element)
        let value = AXHelpers.textValue(element)
        let desc = AXHelpers.descriptionValue(element)
        let ident = AXHelpers.identifier(element)
        let domClasses = AXHelpers.domClassList(element)
        let frame = AXHelpers.frame(element)

        var childNodes: [AXNode] = []
        if depth < maxDepth {
            for child in AXHelpers.children(element) {
                childNodes.append(collectTree(from: child, depth: depth + 1, maxDepth: maxDepth))
            }
        }

        return AXNode(
            role: role,
            subrole: subrole,
            title: title,
            value: value,
            description: desc,
            identifier: ident,
            domClassList: domClasses,
            frame: frame,
            children: childNodes
        )
    }

    /// Check if an app (by bundleId and URL) should get structured tree output.
    private static func needsStructuredTree(bundleId: String, url: String?) -> Bool {
        if parserBundleIDs.contains(bundleId) {
            return true
        }
        // For browsers, check URL patterns
        if let url = url {
            for pattern in parserURLPatterns {
                if url.contains(pattern) {
                    return true
                }
            }
        }
        return false
    }

    /// Get context with optional structured AX tree for apps that have parsers.
    public static func getContextWithTree() -> (context: AppContext, tree: AXNode?)? {
        guard let frontApp = AXHelpers.getFrontmostApp() else {
            if let cached = lastExternalContext {
                return (context: cached, tree: nil)
            }
            return nil
        }

        let isOurApp = excludedBundleIDs.contains(frontApp.bundleId) ||
                       frontApp.name.lowercased().contains("electron") ||
                       frontApp.name.lowercased().contains("kestrel")
        if isOurApp {
            if let cached = lastExternalContext {
                return (context: cached, tree: nil)
            }
            return nil
        }

        let axApp = AXHelpers.appElement(pid: frontApp.pid)
        let window = AXHelpers.focusedWindow(axApp)

        let url = BrowserParser.getURL(bundleId: frontApp.bundleId)

        // Collect flat text (always, for fallback / generic use)
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

        // Collect structured tree only for apps with parsers
        var tree: AXNode? = nil
        if needsStructuredTree(bundleId: frontApp.bundleId, url: url?.url),
           let window = window {
            tree = collectTree(from: window, maxDepth: 20)
        }

        let context = AppContext(
            appName: frontApp.name,
            bundleId: frontApp.bundleId,
            windowTitle: frontApp.windowTitle,
            url: url?.url,
            pageTitle: url?.title ?? frontApp.windowTitle,
            visibleText: visibleText.isEmpty ? nil : visibleText
        )

        lastExternalContext = context
        return (context: context, tree: tree)
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
