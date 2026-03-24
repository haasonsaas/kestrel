import Foundation

/// A serializable snapshot of a single accessibility tree node.
/// Used by per-app parsers on the TypeScript side to extract structured data.
public struct AXNode {
    public let role: String?
    public let subrole: String?
    public let title: String?
    public let value: String?
    public let description: String?
    public let identifier: String?
    public let domClassList: [String]?
    public let frame: AXFrame?
    public let children: [AXNode]

    public init(
        role: String? = nil,
        subrole: String? = nil,
        title: String? = nil,
        value: String? = nil,
        description: String? = nil,
        identifier: String? = nil,
        domClassList: [String]? = nil,
        frame: AXFrame? = nil,
        children: [AXNode] = []
    ) {
        self.role = role
        self.subrole = subrole
        self.title = title
        self.value = value
        self.description = description
        self.identifier = identifier
        self.domClassList = domClassList
        self.frame = frame
        self.children = children
    }

    /// Convert to a dictionary for JSON serialization, omitting nil fields to keep payload small
    public func toDict() -> [String: Any] {
        var dict: [String: Any] = [:]
        if let role { dict["role"] = role }
        if let subrole { dict["subrole"] = subrole }
        if let title { dict["title"] = title }
        if let value { dict["value"] = value }
        if let description { dict["description"] = description }
        if let identifier { dict["identifier"] = identifier }
        if let domClassList, !domClassList.isEmpty { dict["domClassList"] = domClassList }
        if let frame { dict["frame"] = frame.toDict() }
        if !children.isEmpty {
            dict["children"] = children.map { $0.toDict() }
        }
        return dict
    }
}

public struct AXFrame {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }

    public func toDict() -> [String: Any] {
        return ["x": x, "y": y, "width": width, "height": height]
    }
}
