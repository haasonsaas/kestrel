import Foundation

public struct AppContext: Codable {
    public let appName: String
    public let bundleId: String
    public let windowTitle: String?
    public let url: String?
    public let pageTitle: String?
    public let visibleText: [String]?

    public init(
        appName: String,
        bundleId: String,
        windowTitle: String? = nil,
        url: String? = nil,
        pageTitle: String? = nil,
        visibleText: [String]? = nil
    ) {
        self.appName = appName
        self.bundleId = bundleId
        self.windowTitle = windowTitle
        self.url = url
        self.pageTitle = pageTitle
        self.visibleText = visibleText
    }
}

public struct PermissionState: Codable {
    public let accessibility: Bool

    public init(accessibility: Bool) {
        self.accessibility = accessibility
    }
}

public struct FrontmostAppInfo: Codable {
    public let name: String
    public let bundleId: String
    public let pid: Int32
    public let windowTitle: String?

    public init(name: String, bundleId: String, pid: Int32, windowTitle: String?) {
        self.name = name
        self.bundleId = bundleId
        self.pid = pid
        self.windowTitle = windowTitle
    }
}
